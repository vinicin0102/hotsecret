// Upload de mídia do painel, em ordem de preferência:
// 1. Cloudflare R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL): sem custo de
//    tráfego (egress); o navegador envia direto com URL pré-assinada
// 2. Supabase Storage (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY): o navegador envia direto, sem limite da Vercel
// 3. Vercel Blob (BLOB_READ_WRITE_TOKEN)
// 4. Banco de dados (tabela media) — funciona em qualquer lugar, ideal para imagens pequenas
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { withBase } from "@/lib/paths";
import { presignUrl, type S3Creds } from "@/lib/s3-sign";

export const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
  "audio/wav": "wav",
};

/** Limite do upload direto (Supabase Storage). No plano grátis do Supabase o máximo por arquivo é 50 MB. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
/** Corpo máximo aceito pelas funções da Vercel (~4,5 MB). */
export const MAX_SERVER_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Confere a assinatura binária (magic bytes) para não confiar apenas no Content-Type. */
export function sniffMatches(mime: string, buf: Buffer): boolean {
  const hex = buf.subarray(0, 12).toString("hex");
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "image/png") return hex.startsWith("89504e47");
  if (mime === "image/gif") return hex.startsWith("47494638");
  if (mime === "image/webp") return hex.startsWith("52494646") && buf.subarray(8, 12).toString() === "WEBP";
  if (mime === "video/mp4" || mime === "audio/mp4") return buf.subarray(4, 8).toString() === "ftyp";
  if (mime === "video/webm" || mime === "audio/webm") return hex.startsWith("1a45dfa3");
  if (mime === "audio/mpeg") return hex.startsWith("494433") || hex.startsWith("fff");
  if (mime === "audio/ogg") return buf.subarray(0, 4).toString() === "OggS";
  if (mime === "audio/wav") return buf.subarray(0, 4).toString() === "RIFF";
  return false;
}

/** arquivos têm nome único e nunca mudam: o navegador e a CDN guardam por 1 ano */
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
const newKey = (folder: "uploads" | "leads", mime: string, bytes = 8) =>
  `${folder}/${Date.now()}-${randomBytes(bytes).toString("hex")}.${ALLOWED_MIME[mime]}`;

// ---------- Cloudflare R2 (API S3) ----------
export interface R2Config {
  creds: S3Creds;
  /** https://<conta>.r2.cloudflarestorage.com/<bucket> (API, privada) */
  apiBase: string;
  /** link público do bucket (r2.dev ou domínio próprio), sem barra no fim */
  publicUrl: string;
}

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  let publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!accessKeyId || !secretAccessKey || !bucket || !publicUrl || (!accountId && !process.env.R2_ENDPOINT)) return null;
  if (!/^https?:\/\//.test(publicUrl)) publicUrl = `https://${publicUrl}`;
  const endpoint = (process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/, "");
  return { creds: { accessKeyId, secretAccessKey, region: "auto" }, apiBase: `${endpoint}/${bucket}`, publicUrl };
}

const r2ObjectUrl = (cfg: R2Config, key: string) => `${cfg.apiBase}/${key}`;
export const r2PublicUrl = (cfg: R2Config, key: string) => `${cfg.publicUrl}/${key}`;

/** cabeçalhos assinados do envio: quem usar a URL precisa mandar exatamente estes */
const putHeaders = (mime: string) => ({ "Content-Type": mime, "Cache-Control": IMMUTABLE_CACHE });

export function r2PresignPut(cfg: R2Config, key: string, mime: string, expiresSec = 3600) {
  const headers = putHeaders(mime);
  return { url: presignUrl(cfg.creds, { method: "PUT", url: r2ObjectUrl(cfg, key), headers, expiresSec }), headers };
}

/** envia um arquivo ao R2 pelo servidor */
export async function r2Put(cfg: R2Config, key: string, body: Uint8Array<ArrayBuffer>, mime: string): Promise<void> {
  const { url, headers } = r2PresignPut(cfg, key, mime, 900);
  const res = await fetch(url, { method: "PUT", headers, body });
  if (!res.ok) throw new Error(`R2 recusou o envio (${res.status}) ${(await res.text()).slice(0, 200)}`);
}

/** tamanho do arquivo no R2 (null = não existe) */
export async function r2Head(cfg: R2Config, key: string): Promise<number | null> {
  const res = await fetch(presignUrl(cfg.creds, { method: "HEAD", url: r2ObjectUrl(cfg, key), expiresSec: 900 }), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 ${res.status}`);
  return Number(res.headers.get("content-length") ?? 0);
}

export async function r2Delete(cfg: R2Config, key: string): Promise<void> {
  await fetch(presignUrl(cfg.creds, { method: "DELETE", url: r2ObjectUrl(cfg, key), expiresSec: 900 }), { method: "DELETE" });
}

// ---------- Supabase Storage (upload direto do navegador com URL assinada) ----------
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "hotsecret";

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key, bucket: BUCKET, publicPrefix: `${url}/storage/v1/object/public/${BUCKET}/` } : null;
}

const MB = 1024 * 1024;
/** Limites tentados no bucket: o maior que o plano do Supabase aceitar (grátis = 50 MB por arquivo). */
const LIMIT_CANDIDATES = [MAX_UPLOAD_BYTES, 50 * MB];
/** limite efetivo do bucket em bytes (null = ainda não verificado) */
let bucketLimit: number | null = null;

async function ensureBucket(cfg: { url: string; key: string }): Promise<number> {
  if (bucketLimit !== null) return bucketLimit;
  const headers = { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, "Content-Type": "application/json" };
  const read = async () => {
    const r = await fetch(`${cfg.url}/storage/v1/bucket/${BUCKET}`, { headers });
    if (!r.ok) return null;
    const b = (await r.json()) as { file_size_limit?: number | null };
    return b.file_size_limit ?? 0; // 0 = sem limite no bucket (vale o limite do projeto)
  };
  let current = await read();
  if (current === null) {
    // cria com o maior limite aceito
    for (const limit of LIMIT_CANDIDATES) {
      const r = await fetch(`${cfg.url}/storage/v1/bucket`, {
        method: "POST",
        headers,
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: limit }),
      });
      if (r.ok) break;
      console.warn("[storage] criar bucket com", limit / MB, "MB:", r.status, (await r.text()).slice(0, 200));
    }
    current = await read();
    if (current === null) throw new Error("Não foi possível criar o bucket no Supabase");
  }
  if (current > 0 && current < MAX_UPLOAD_BYTES) {
    // buckets antigos tinham 25 MB: tenta subir o limite até o máximo do plano
    for (const limit of LIMIT_CANDIDATES.filter((l) => l > current!)) {
      const r = await fetch(`${cfg.url}/storage/v1/bucket/${BUCKET}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ public: true, file_size_limit: limit }),
      });
      if (r.ok) break;
      console.warn("[storage] limite de", limit / MB, "MB recusado:", r.status, (await r.text()).slice(0, 200));
    }
    current = (await read()) ?? current;
  }
  bucketLimit = current > 0 ? current : MAX_UPLOAD_BYTES;
  return bucketLimit;
}

export interface UploadTicket {
  mode: "direct" | "server";
  uploadUrl?: string;
  publicUrl?: string;
  /** cabeçalhos que o navegador deve mandar no envio direto (R2) */
  headers?: Record<string, string>;
  maxServerBytes: number;
  /** tamanho máximo aceito pelo Supabase neste projeto */
  maxDirectBytes?: number;
}

export class UploadTooLargeError extends Error {}

/** Decide como o navegador deve enviar o arquivo. */
export async function createUploadTicket(mime: string, size = 0): Promise<UploadTicket> {
  const maxServerBytes = process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL ? MAX_SERVER_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  const r2 = r2Config();
  if (r2) {
    const key = newKey("uploads", mime);
    const { url, headers } = r2PresignPut(r2, key, mime);
    return { mode: "direct", uploadUrl: url, publicUrl: r2PublicUrl(r2, key), headers, maxServerBytes, maxDirectBytes: MAX_UPLOAD_BYTES };
  }
  const cfg = supabaseConfig();
  if (!cfg) return { mode: "server", maxServerBytes };
  let limit: number;
  try {
    limit = await ensureBucket(cfg);
  } catch (err) {
    console.error("[storage] Supabase indisponível, usando upload pelo servidor", err);
    return { mode: "server", maxServerBytes };
  }
  if (size > limit) {
    throw new UploadTooLargeError(
      `Arquivo de ${(size / MB).toFixed(0)} MB: o armazenamento (Supabase) deste projeto aceita até ${(limit / MB).toFixed(0)} MB por arquivo. ` +
        "No plano grátis do Supabase o máximo é 50 MB — comprima o vídeo (ex.: 720p) ou cole o link de um vídeo hospedado em outro lugar.",
    );
  }
  try {
    const path = newKey("uploads", mime);
    const res = await fetch(`${cfg.url}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`assinatura ${res.status}`);
    const data = (await res.json()) as { url?: string; signedUrl?: string };
    const signed = data.url ?? data.signedUrl;
    if (!signed) throw new Error("resposta sem url");
    return {
      mode: "direct",
      uploadUrl: `${cfg.url}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`,
      publicUrl: `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}`,
      maxServerBytes,
      maxDirectBytes: limit,
    };
  } catch (err) {
    console.error("[storage] Supabase indisponível, usando upload pelo servidor", err);
    return { mode: "server", maxServerBytes };
  }
}

/** Upload recebido pelo servidor: R2, Vercel Blob ou banco de dados. */
export async function storeFile(buf: Buffer, mime: string): Promise<string> {
  const ext = ALLOWED_MIME[mime];
  const r2 = r2Config();
  if (r2) {
    try {
      const key = newKey("uploads", mime);
      await r2Put(r2, key, new Uint8Array(buf), mime);
      return r2PublicUrl(r2, key);
    } catch (err) {
      console.error("[storage] R2 indisponível no envio pelo servidor", err);
    }
  }
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const res = await fetch(`https://blob.vercel-storage.com/hot-secret/${name}`, {
      method: "PUT",
      headers: {
        authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
        "x-api-version": "7",
        "x-content-type": mime,
        "x-add-random-suffix": "0",
      },
      body: new Uint8Array(buf),
    });
    if (!res.ok) throw new Error(`Falha no upload (Blob ${res.status})`);
    return ((await res.json()) as { url: string }).url;
  }
  const media = await prisma.media.create({ data: { mime, size: buf.length, data: new Uint8Array(buf) } });
  return withBase(`/api/uploads/${media.id}.${ext}`);
}

// ---------- Fotos enviadas pelo lead no chat ----------
export const LEAD_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
/** a foto já chega comprimida pelo navegador (~1600px); o limite cobre a função da Vercel */
export const MAX_LEAD_PHOTO_BYTES = 4 * 1024 * 1024;

/** Guarda a foto do lead: R2 ou Supabase Storage (pasta leads/), senão Blob ou banco. */
export async function storeLeadPhoto(buf: Buffer, mime: string): Promise<string> {
  const r2 = r2Config();
  if (r2) {
    try {
      const key = newKey("leads", mime, 12);
      await r2Put(r2, key, new Uint8Array(buf), mime);
      return r2PublicUrl(r2, key);
    } catch (err) {
      console.error("[storage] foto do lead no R2 falhou", err);
    }
  }
  const cfg = supabaseConfig();
  if (cfg) {
    try {
      await ensureBucket(cfg);
      const path = newKey("leads", mime, 12);
      const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.key}`, apikey: cfg.key, "Content-Type": mime, "x-upsert": "false" },
        body: new Uint8Array(buf),
      });
      if (!res.ok) throw new Error(`upload ${res.status} ${(await res.text()).slice(0, 200)}`);
      return `${cfg.url}/storage/v1/object/public/${BUCKET}/${path}`;
    } catch (err) {
      console.error("[storage] foto do lead no Supabase falhou, usando o banco", err);
    }
  }
  return storeFile(buf, mime);
}

/** Lê uma imagem guardada por este sistema (para a IA ver a foto do lead). Links de fora não são buscados. */
export async function readStoredImage(url: string): Promise<{ data: string; mime: string } | null> {
  const local = /\/api\/uploads\/([a-z0-9]{10,40})\.\w{2,5}$/.exec(url);
  if (local && url.startsWith(withBase("/api/uploads/"))) {
    const media = await prisma.media.findUnique({ where: { id: local[1] } });
    if (!media || !media.mime.startsWith("image/")) return null;
    return { data: Buffer.from(media.data).toString("base64"), mime: media.mime };
  }
  const cfg = supabaseConfig();
  const r2 = r2Config();
  const trusted =
    (cfg && url.startsWith(`${cfg.publicPrefix}leads/`)) ||
    (r2 && url.startsWith(`${r2.publicUrl}/leads/`)) ||
    /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/hot-secret\//.test(url);
  if (!trusted) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    if (!LEAD_PHOTO_MIME.includes(mime as (typeof LEAD_PHOTO_MIME)[number]) || buf.length > MAX_LEAD_PHOTO_BYTES) return null;
    return { data: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}
