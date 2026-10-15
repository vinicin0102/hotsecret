import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useFetch } from "@/hooks/useFetch";
import { api } from "@/lib/client";

interface Status {
  r2: boolean;
  supabase: boolean;
  missing: string[];
  publicHost: string | null;
}
interface Check {
  id: string;
  ok: boolean;
  message: string;
}
interface Obj {
  key: string;
  size: number;
}
type CopyResult = { key: string; status: "copied" | "exists" | "failed"; error?: string };

const CORS_JSON = `[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]`;

const gb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${(b / 1024 ** 2).toFixed(1)} MB`);
const errMsg = (e: unknown) => (e as Error)?.message || "Erro";

/** agrupa os arquivos em lotes de até 20 arquivos / 25 MB (vídeos grandes vão sozinhos) */
function batches(objs: Obj[]): Obj[][] {
  const out: Obj[][] = [];
  let cur: Obj[] = [];
  let size = 0;
  for (const o of objs) {
    if (cur.length && (cur.length >= 20 || size + o.size > 25 * 1024 ** 2)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(o);
    size += o.size;
  }
  if (cur.length) out.push(cur);
  return out;
}

export default function Armazenamento() {
  const { data: status } = useFetch<Status>("/api/admin/storage");
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const [objs, setObjs] = useState<Obj[] | null>(null);
  const [copying, setCopying] = useState(false);
  const [done, setDone] = useState({ files: 0, bytes: 0, copied: 0, exists: 0 });
  const [failed, setFailed] = useState<CopyResult[]>([]);
  const [copyFinished, setCopyFinished] = useState(false);

  const [preview, setPreview] = useState<{ total: number; tables: Record<string, number>; from: string; to: string } | null>(null);
  const [rewritten, setRewritten] = useState<{ total: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const runCheck = async () => {
    setChecking(true);
    setError("");
    try {
      setChecks((await api<{ checks: Check[] }>("/api/admin/storage", { body: { action: "check" } })).checks);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setChecking(false);
    }
  };

  const copy = async (list?: Obj[]) => {
    setCopying(true);
    setError("");
    setCopyFinished(false);
    setPreview(null);
    try {
      let all = list;
      if (!all) {
        all = (await api<{ objects: Obj[] }>("/api/admin/storage", { body: { action: "list" } })).objects;
        setObjs(all);
        setDone({ files: 0, bytes: 0, copied: 0, exists: 0 });
      }
      const fails: CopyResult[] = [];
      for (const batch of batches(all)) {
        let results: CopyResult[];
        try {
          results = (await api<{ results: CopyResult[] }>("/api/admin/storage", { body: { action: "copy", keys: batch.map((o) => o.key) } })).results;
        } catch (e) {
          results = batch.map((o) => ({ key: o.key, status: "failed" as const, error: errMsg(e) }));
        }
        fails.push(...results.filter((r) => r.status === "failed"));
        const bytes = batch.filter((o) => results.find((r) => r.key === o.key && r.status !== "failed")).reduce((n, o) => n + o.size, 0);
        setDone((d) => ({
          files: d.files + results.filter((r) => r.status !== "failed").length,
          bytes: d.bytes + bytes,
          copied: d.copied + results.filter((r) => r.status === "copied").length,
          exists: d.exists + results.filter((r) => r.status === "exists").length,
        }));
      }
      setFailed(fails);
      setCopyFinished(true);
      if (!fails.length) setPreview(await scanTables(true));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setCopying(false);
    }
  };

  /** passa pelas tabelas uma por vez (cada pedido é curto e não trava o banco) */
  const scanTables = async (dryRun: boolean) => {
    const info = await api<{ from: string; to: string; tables: string[] }>("/api/admin/storage", { body: { action: "tables" } });
    const tables: Record<string, number> = {};
    let total = 0;
    for (const table of info.tables) {
      const { n } = await api<{ n: number }>("/api/admin/storage", { body: { action: "rewrite", table, dryRun } });
      if (n > 0) {
        tables[table] = n;
        total += n;
      }
    }
    return { from: info.from, to: info.to, total, tables };
  };

  const retryFailed = () => objs && copy(objs.filter((o) => failed.some((f) => f.key === o.key)));

  const rewrite = async () => {
    if (!confirm("Trocar todos os links do Supabase pelos do Cloudflare R2? Os arquivos já foram copiados.")) return;
    setBusy(true);
    setError("");
    try {
      setRewritten(await scanTables(false));
      setPreview(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const totalBytes = objs?.reduce((n, o) => n + o.size, 0) ?? 0;
  const corsFailed = checks?.some((c) => c.id === "cors" && !c.ok);
  const r2Ready = !!checks && checks.every((c) => c.ok);

  return (
    <AdminLayout title="Armazenamento" subtitle="Onde ficam as fotos, vídeos e áudios do funil">
      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>☁ Cloudflare R2</h3>
          <span className="pill">{status ? (status.r2 ? "conectado" : "não configurado") : "…"}</span>
        </div>
        {status && !status.r2 && (
          <p className="hint">
            Faltam estas variáveis na Vercel: <b>{status.missing.join(", ")}</b>. Depois de adicionar, publique de novo.
          </p>
        )}
        {status?.r2 && (
          <p className="hint">
            Novos envios vão para o R2 (sem custo de tráfego) · link público: <b>{status.publicHost}</b>
          </p>
        )}
        <button className="btn btn-primary" onClick={runCheck} disabled={checking || !status?.r2} data-testid="r2-check">
          {checking ? "Testando…" : "Testar conexão"}
        </button>
        {checks && (
          <ul className="storage-checks" data-testid="r2-checks">
            {checks.map((c) => (
              <li key={c.id} className={c.ok ? "ok" : "bad"}>
                {c.ok ? "✅" : "❌"} {c.message}
              </li>
            ))}
          </ul>
        )}
        {corsFailed && (
          <div className="storage-cors">
            <p className="hint">
              No Cloudflare: <b>R2 → bucket → Settings → CORS Policy → Add CORS policy</b>, apague o que estiver lá, cole o texto abaixo e salve.
              Depois toque em Testar conexão de novo.
            </p>
            <pre>{CORS_JSON}</pre>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(CORS_JSON)}>
              Copiar
            </button>
          </div>
        )}
      </div>

      {status?.supabase && (
        <div className="card">
          <div className="card-head">
            <h3>Migrar arquivos do Supabase para o R2</h3>
          </div>
          <p className="hint">
            <b>1.</b> Copia cada arquivo do Supabase para o R2 (pode repetir: os que já foram copiados são pulados). <b>2.</b> Troca os links salvos
            nos fluxos, produtos, vídeos, personagens, cérebros e conversas. Só depois disso o tráfego do Supabase para de crescer.
          </p>
          {!r2Ready && <p className="hint">Primeiro toque em <b>Testar conexão</b> e deixe tudo ✅.</p>}
          <button className="btn btn-primary" onClick={() => copy()} disabled={!r2Ready || copying || busy} data-testid="r2-copy">
            {copying ? "Copiando…" : "1. Copiar arquivos"}
          </button>
          {objs && (
            <div className="storage-progress" data-testid="r2-progress">
              <div className="bar">
                <span style={{ width: `${objs.length ? Math.round(((done.files + failed.length) / objs.length) * 100) : 100}%` }} />
              </div>
              <p className="hint">
                {done.files} de {objs.length} arquivos · {gb(done.bytes)} de {gb(totalBytes)}
                {done.exists ? ` · ${done.exists} já estavam no R2` : ""}
              </p>
            </div>
          )}
          {copyFinished && failed.length > 0 && (
            <div className="storage-failed">
              <p className="error-text">{failed.length} arquivo(s) não copiaram:</p>
              <ul>
                {failed.slice(0, 10).map((f) => (
                  <li key={f.key}>
                    {f.key} — {f.error}
                  </li>
                ))}
              </ul>
              <button className="btn btn-ghost btn-sm" onClick={retryFailed} disabled={copying}>
                Tentar de novo os que falharam
              </button>
            </div>
          )}
          {copyFinished && !failed.length && objs && <p className="hint">✅ Todos os {objs.length} arquivos estão no R2.</p>}
          {preview && (
            <div className="storage-rewrite">
              <p className="hint">
                <b>{preview.total}</b> registro(s) com links do Supabase ({preview.from}) serão trocados para <b>{preview.to}</b>
                {Object.keys(preview.tables).length ? `: ${Object.entries(preview.tables).map(([t, n]) => `${t} (${n})`).join(", ")}` : ""}.
              </p>
              <button className="btn btn-primary" onClick={rewrite} disabled={busy || !preview.total} data-testid="r2-rewrite">
                {busy ? "Trocando…" : "2. Trocar os links para o R2"}
              </button>
            </div>
          )}
          {rewritten && (
            <p className="hint" data-testid="r2-rewritten">
              ✅ Pronto: {rewritten.total} link(s) trocados para o R2. As mídias do funil já carregam do Cloudflare.
            </p>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
