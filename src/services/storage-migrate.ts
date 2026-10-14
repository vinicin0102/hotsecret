// Cloudflare R2: teste de conexão (envio, link público, CORS) e migração dos arquivos do Supabase Storage
// (copia cada arquivo com o mesmo caminho e depois troca os links salvos no banco).
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { presignUrl } from "@/lib/s3-sign";
import { r2Config, r2Delete, r2Head, r2Put, r2PublicUrl, supabaseConfig, type R2Config } from "@/services/storage";

export const R2_ENV_NAMES = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;

/** regra de CORS do bucket: o painel envia direto do navegador (PUT) e lê os vídeos para otimizar (GET) */
export const CORS_RULES = [{ AllowedOrigins: ["*"], AllowedMethods: ["GET", "PUT", "HEAD"], AllowedHeaders: ["*"], MaxAgeSeconds: 3600 }];

export function storageStatus() {
  const r2 = r2Config();
  return {
    r2: !!r2,
    supabase: !!supabaseConfig(),
    missing: R2_ENV_NAMES.filter((n) => !process.env[n]?.trim()),
    publicHost: r2 ? new URL(r2.publicUrl).host : null,
  };
}

export interface Check {
  id: "config" | "write" | "public" | "cors";
  ok: boolean;
  message: string;
}

async function corsAllows(cfg: R2Config, origin: string): Promise<boolean> {
  // mesma situação de um envio real: arquivo novo
  const res = await fetch(`${cfg.apiBase}/_teste/novo-${Date.now()}.mp4`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,cache-control" },
  }).catch(() => null);
  const allow = res?.headers.get("access-control-allow-origin");
  return !!res && res.ok && (allow === "*" || allow === origin);
}

async function putCors(cfg: R2Config): Promise<boolean> {
  const rule = CORS_RULES[0];
  const xml =
    `<CORSConfiguration><CORSRule>` +
    rule.AllowedOrigins.map((o) => `<AllowedOrigin>${o}</AllowedOrigin>`).join("") +
    rule.AllowedMethods.map((m) => `<AllowedMethod>${m}</AllowedMethod>`).join("") +
    rule.AllowedHeaders.map((h) => `<AllowedHeader>${h}</AllowedHeader>`).join("") +
    `<MaxAgeSeconds>${rule.MaxAgeSeconds}</MaxAgeSeconds></CORSRule></CORSConfiguration>`;
  const headers = { "Content-Type": "application/xml", "Content-MD5": createHash("md5").update(xml).digest("base64") };
  const url = presignUrl(cfg.creds, { method: "PUT", url: cfg.apiBase, query: { cors: "" }, headers, expiresSec: 300 });
  const res = await fetch(url, { method: "PUT", headers, body: xml }).catch(() => null);
  return !!res?.ok;
}

/** Testa o R2 de ponta a ponta. `origin` = endereço do painel (para conferir a CORS). Nunca devolve valores das variáveis. */
export async function checkR2(origin: string): Promise<Check[]> {
  const status = storageStatus();
  const cfg = r2Config();
  if (!cfg) {
    return [{ id: "config", ok: false, message: `Faltam variáveis na Vercel: ${status.missing.join(", ") || "R2_*"} (depois de adicionar, publique de novo).` }];
  }
  const checks: Check[] = [];
  if (/r2\.cloudflarestorage\.com/.test(cfg.publicUrl)) {
    checks.push({
      id: "config",
      ok: false,
      message: "R2_PUBLIC_URL está com o endereço da API (r2.cloudflarestorage.com). Use o link público do bucket (pub-….r2.dev ou seu domínio).",
    });
    return checks;
  }
  checks.push({ id: "config", ok: true, message: `Variáveis configuradas · link público: ${status.publicHost}` });

  const key = "_teste/conexao.txt";
  const body = `hotsecret ${Date.now()}`;
  try {
    await r2Put(cfg, key, new TextEncoder().encode(body), "text/plain");
    checks.push({ id: "write", ok: true, message: "Envio de arquivos funcionando" });
  } catch (e) {
    const m = String((e as Error).message);
    const hint = /\b(401|403)\b/.test(m)
      ? "a chave não tem permissão (use Object Read & Write) ou R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY estão trocadas"
      : /\b404\b|NoSuchBucket/.test(m)
        ? "bucket não encontrado — confira R2_BUCKET"
        : /fetch failed|ENOTFOUND|getaddrinfo/i.test(m)
          ? "não conectou — confira R2_ACCOUNT_ID"
          : m.slice(0, 160);
    checks.push({ id: "write", ok: false, message: `Não consegui enviar ao R2: ${hint}` });
    return checks;
  }

  try {
    const res = await fetch(`${r2PublicUrl(cfg, key)}?t=${Date.now()}`);
    const text = res.ok ? await res.text() : "";
    checks.push(
      text === body
        ? { id: "public", ok: true, message: "Link público funcionando (os leads conseguem ver as mídias)" }
        : {
            id: "public",
            ok: false,
            message: `O link público não mostrou o arquivo (${res.status}). Ative o acesso público (r2.dev) no bucket e confira se R2_PUBLIC_URL é desse bucket.`,
          },
    );
  } catch {
    checks.push({ id: "public", ok: false, message: "O link público (R2_PUBLIC_URL) não respondeu — confira o endereço." });
  }

  let cors = await corsAllows(cfg, origin);
  let auto = false;
  if (!cors && (await putCors(cfg))) {
    auto = true;
    cors = await corsAllows(cfg, origin);
  }
  checks.push(
    cors
      ? { id: "cors", ok: true, message: auto ? "CORS configurada automaticamente — o painel já envia direto ao R2" : "CORS ok — o painel envia direto ao R2" }
      : { id: "cors", ok: false, message: "Falta a CORS do bucket (sem ela o painel não consegue enviar vídeos)." },
  );
  await r2Delete(cfg, key).catch(() => undefined);
  return checks;
}

// ---------- migração Supabase → R2 ----------
export interface StoredObject {
  key: string;
  size: number;
}

/** lista todos os arquivos do bucket do Supabase (todas as pastas) */
export async function listSupabaseObjects(): Promise<StoredObject[]> {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error("Supabase não está configurado");
  const out: StoredObject[] = [];
  const walk = async (prefix: string, depth: number): Promise<void> => {
    for (let offset = 0; ; offset += 1000) {
      const res = await fetch(`${cfg.url}/storage/v1/object/list/${cfg.bucket}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
      });
      if (!res.ok) throw new Error(`Supabase recusou a listagem (${res.status})`);
      const items = (await res.json()) as { name: string; id: string | null; metadata?: { size?: number } | null }[];
      for (const it of items) {
        const path = prefix ? `${prefix}/${it.name}` : it.name;
        if (it.id === null) {
          if (depth < 6) await walk(path, depth + 1);
        } else if (it.name !== ".emptyFolderPlaceholder") {
          out.push({ key: path, size: Number(it.metadata?.size ?? 0) });
        }
      }
      if (items.length < 1000) break;
    }
  };
  await walk("", 0);
  return out;
}

export type CopyResult = { key: string; status: "copied" | "exists" | "failed"; error?: string };

/** copia arquivos do Supabase para o R2 (mesmo caminho). Pula os que já estão lá com o mesmo tamanho. */
export async function copyToR2(keys: string[]): Promise<CopyResult[]> {
  const sb = supabaseConfig();
  const r2 = r2Config();
  if (!sb || !r2) throw new Error("Configure o Supabase e o R2");
  const results: CopyResult[] = [];
  for (const key of keys) {
    try {
      if (!/^[\w./-]+$/.test(key) || key.includes("..")) throw new Error("caminho inválido");
      const res = await fetch(`${sb.url}/storage/v1/object/${sb.bucket}/${key}`, { headers: { Authorization: `Bearer ${sb.key}`, apikey: sb.key } });
      if (!res.ok) throw new Error(`Supabase ${res.status}`);
      const size = Number(res.headers.get("content-length") ?? -1);
      const existing = await r2Head(r2, key);
      if (existing !== null && existing === size) {
        await res.body?.cancel();
        results.push({ key, status: "exists" });
        continue;
      }
      const mime = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
      await r2Put(r2, key, new Uint8Array(await res.arrayBuffer()), mime);
      results.push({ key, status: "copied" });
    } catch (e) {
      results.push({ key, status: "failed", error: String((e as Error).message).slice(0, 200) });
    }
  }
  return results;
}

/** colunas de texto/JSON do banco (onde ficam os links das mídias) */
async function textColumns(): Promise<{ table: string; column: string; type: string }[]> {
  const rows = await prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
    SELECT table_name, column_name, data_type FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      AND table_name NOT LIKE '\\_prisma%'`;
  return rows.map((r) => ({ table: r.table_name, column: r.column_name, type: r.data_type }));
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

/**
 * Troca os links do Supabase pelos do R2 em todo o banco. dryRun = só conta.
 * Devolve quantos registros têm (ou tinham) links em cada tabela.
 */
export async function rewriteUrls(dryRun: boolean): Promise<{ from: string; to: string; total: number; tables: Record<string, number> }> {
  const sb = supabaseConfig();
  const r2 = r2Config();
  if (!sb || !r2) throw new Error("Configure o Supabase e o R2");
  const from = sb.publicPrefix;
  const to = `${r2.publicUrl}/`;
  const tables: Record<string, number> = {};
  let total = 0;
  for (const c of await textColumns()) {
    const cast = c.type === "character varying" ? "text" : c.type;
    const where = `strpos(${q(c.column)}::text, $1) > 0`;
    const n = dryRun
      ? Number((await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${q(c.table)} WHERE ${where}`, from))[0]?.n ?? 0)
      : await prisma.$executeRawUnsafe(`UPDATE ${q(c.table)} SET ${q(c.column)} = replace(${q(c.column)}::text, $1, $2)::${cast} WHERE ${where}`, from, to);
    if (n > 0) {
      tables[c.table] = (tables[c.table] ?? 0) + n;
      total += n;
    }
  }
  return { from: new URL(from).host, to: new URL(to).host, total, tables };
}
