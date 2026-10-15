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
      <DbCleanupCard />
    </AdminLayout>
  );
}

type CleanupId = "webhook_logs" | "webhook_events" | "events" | "media" | "leads";
interface DbInfo {
  tables: { table: string; bytes: number; rows: number }[];
  appBytes: number;
  databaseBytes: number;
  defaults: Record<CleanupId, number>;
}
const TABLE_LABEL: Record<string, string> = {
  events: "Eventos (analytics)",
  messages: "Mensagens das conversas",
  leads: "Leads",
  conversations: "Conversas",
  webhook_logs: "Registros de webhooks",
  webhook_events: "Webhooks já processados",
  media: "Arquivos guardados no banco",
  payments: "Pagamentos",
  funnel_nodes: "Blocos dos fluxos",
  brains: "Cérebros",
};
const CLEANUP_INFO: { id: CleanupId; title: string; what: string; days: boolean; danger?: boolean }[] = [
  { id: "webhook_logs", title: "Registros de webhooks antigos", what: "Histórico técnico dos avisos do gateway de pagamento. Os pagamentos continuam salvos.", days: true },
  { id: "webhook_events", title: "Controle de webhooks antigos", what: "Lista usada para não processar o mesmo aviso duas vezes. O gateway não reenvia avisos tão antigos.", days: true },
  {
    id: "events",
    title: "Eventos antigos do analytics",
    what: "Visitas, cliques e respostas da IA. O Analytics deixa de mostrar o período apagado; leads, conversas e pagamentos continuam.",
    days: true,
  },
  { id: "media", title: "Arquivos sem uso guardados no banco", what: "Fotos e áudios enviados que nenhum fluxo, produto, cérebro ou conversa usa mais.", days: false },
  {
    id: "leads",
    title: "Leads abandonados",
    what: "Leads que nunca pagaram nada e não conversam há muito tempo — some junto a conversa, as mensagens e as etiquetas deles. Não dá para desfazer.",
    days: true,
    danger: true,
  },
];
const fmtNum = (n: number) => n.toLocaleString("pt-BR");

function DbCleanupCard() {
  const { data, reload } = useFetch<DbInfo>("/api/admin/db-cleanup");
  const [days, setDays] = useState<Partial<Record<CleanupId, number>>>({});
  const [preview, setPreview] = useState<Partial<Record<CleanupId, { count: number; bytes?: number }>>>({});
  const [busy, setBusy] = useState<CleanupId | null>(null);
  const [done, setDone] = useState<Partial<Record<CleanupId, number>>>({});
  const [error, setError] = useState("");
  if (!data) return null;
  const daysOf = (id: CleanupId) => days[id] ?? data.defaults[id];

  const check = async (id: CleanupId) => {
    setBusy(id);
    setError("");
    try {
      const r = await api<{ count: number; bytes?: number }>("/api/admin/db-cleanup", { body: { action: "preview", id, days: daysOf(id) } });
      setPreview((p) => ({ ...p, [id]: r }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };
  const run = async (id: CleanupId, title: string) => {
    const n = preview[id]?.count ?? 0;
    if (!confirm(`Apagar ${fmtNum(n)} item(ns) de "${title}"? Não dá para desfazer.`)) return;
    setBusy(id);
    setError("");
    let total = 0;
    try {
      for (let i = 0; i < 200; i++) {
        const r = await api<{ deleted: number; more: boolean }>("/api/admin/db-cleanup", { body: { action: "run", id, days: daysOf(id) } });
        total += r.deleted;
        setDone((d) => ({ ...d, [id]: total }));
        if (!r.more) break;
      }
      await api("/api/admin/db-cleanup", { body: { action: "vacuum", id } }).catch(() => undefined);
      setPreview((p) => ({ ...p, [id]: undefined }));
      reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>🧹 Limpeza do banco de dados</h3>
        <span className="pill">{gb(data.databaseBytes)}</span>
      </div>
      <p className="hint">
        O banco inteiro tem <b>{gb(data.databaseBytes)}</b>, sendo <b>{gb(data.appBytes)}</b> das tabelas do sistema. Nada é apagado sem você tocar em{" "}
        <b>Apagar</b> e confirmar.
      </p>
      <div className="db-tables">
        {data.tables.slice(0, 8).map((t) => (
          <div key={t.table} className="db-table-row">
            <span>{TABLE_LABEL[t.table] ?? t.table}</span>
            <span className="muted">{fmtNum(t.rows)} linhas</span>
            <b>{gb(t.bytes)}</b>
          </div>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="db-cleanups">
        {CLEANUP_INFO.map((c) => {
          const p = preview[c.id];
          return (
            <div key={c.id} className={`db-cleanup ${c.danger ? "danger" : ""}`} data-testid={`clean-${c.id}`}>
              <div className="db-cleanup-head">
                <b>{c.title}</b>
                {c.days && (
                  <label className="db-days">
                    mais de
                    <input
                      type="number"
                      className="input"
                      min={1}
                      value={daysOf(c.id)}
                      onChange={(e) => {
                        setDays((d) => ({ ...d, [c.id]: Number(e.target.value) || data.defaults[c.id] }));
                        setPreview((pv) => ({ ...pv, [c.id]: undefined }));
                      }}
                    />
                    dias
                  </label>
                )}
              </div>
              <p className="hint">{c.what}</p>
              <div className="row">
                <button className="btn btn-sm" disabled={busy !== null} onClick={() => check(c.id)}>
                  {busy === c.id && !p ? "Contando…" : "Ver quanto sai"}
                </button>
                {p && (
                  <>
                    <span className="hint" data-testid={`count-${c.id}`}>
                      {fmtNum(p.count)} item(ns){p.bytes ? ` · ${gb(p.bytes)}` : ""}
                    </span>
                    {p.count > 0 && (
                      <button className={`btn btn-sm ${c.danger ? "btn-danger" : "btn-primary"}`} disabled={busy !== null} onClick={() => run(c.id, c.title)}>
                        {busy === c.id ? "Apagando…" : "Apagar"}
                      </button>
                    )}
                  </>
                )}
                {done[c.id] !== undefined && busy !== c.id && (
                  <span className="hint" data-testid={`done-${c.id}`}>
                    ✅ {fmtNum(done[c.id]!)} apagado(s)
                  </span>
                )}
                {busy === c.id && done[c.id] !== undefined && <span className="hint">{fmtNum(done[c.id]!)} apagado(s)…</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Depois de apagar, o banco reaproveita o espaço para os dados novos. O número no Supabase (Database Size) pode demorar a cair.
      </p>
    </div>
  );
}
