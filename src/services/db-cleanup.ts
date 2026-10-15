// Limpeza do banco: mostra o tamanho das tabelas e apaga, em lotes, só o que o dono escolher
// (registros de webhook antigos, eventos antigos, arquivos guardados no banco sem uso e leads abandonados).
import { dbSchema, prisma } from "@/lib/prisma";

export const CLEANUPS = ["webhook_logs", "webhook_events", "events", "media", "leads"] as const;
export type CleanupId = (typeof CLEANUPS)[number];

/** dias padrão de cada limpeza (o que for mais antigo que isso sai) */
export const DEFAULT_DAYS: Record<CleanupId, number> = { webhook_logs: 30, webhook_events: 30, events: 180, media: 1, leads: 90 };
/** limpezas com prazo que o dono pode mudar (as outras usam o padrão) */
export const MIN_DAYS: Record<CleanupId, number> = { webhook_logs: 7, webhook_events: 7, events: 30, media: 1, leads: 30 };

const BATCH = 2000;
/** cada pedido apaga por até ~40s (limite da função) e o painel repete enquanto houver mais */
const TIME_BUDGET_MS = 40_000;

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const qt = (table: string) => `${q(dbSchema())}.${q(table)}`;

export async function dbSizes() {
  const schema = dbSchema();
  const [tables, db] = await Promise.all([
    prisma.$queryRaw<{ table: string; bytes: bigint; rows: number }[]>`
      SELECT c.relname AS "table", pg_total_relation_size(c.oid) AS bytes, GREATEST(c.reltuples, 0)::float8 AS rows
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schema} AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC`,
    prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database()) AS bytes`,
  ]);
  const list = tables.map((t) => ({ table: t.table, bytes: Number(t.bytes), rows: Math.round(Number(t.rows)) }));
  return { tables: list, appBytes: list.reduce((n, t) => n + t.bytes, 0), databaseBytes: Number(db[0]?.bytes ?? 0) };
}

const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000);

/** ids dos arquivos guardados no banco (/api/uploads/<id>.ext) que algum fluxo, produto, conversa etc. ainda usa */
async function referencedMediaIds(): Promise<Set<string>> {
  const cols = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = ${dbSchema()} AND data_type IN ('text', 'character varying', 'json', 'jsonb')
      AND table_name NOT IN ('media', 'events', 'webhook_logs') AND table_name NOT LIKE '\\_prisma%'`;
  const ids = new Set<string>();
  for (const c of cols) {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT DISTINCT (regexp_matches(${q(c.column_name)}::text, '/api/uploads/([a-z0-9]{10,40})\\.', 'g'))[1] AS id
       FROM ${qt(c.table_name)} WHERE strpos(${q(c.column_name)}::text, '/api/uploads/') > 0`,
    );
    for (const r of rows) ids.add(r.id);
  }
  return ids;
}

async function unusedMedia(days: number): Promise<{ id: string; size: number }[]> {
  const used = await referencedMediaIds();
  const all = await prisma.media.findMany({ where: { createdAt: { lt: cutoff(days) } }, select: { id: true, size: true } });
  return all.filter((m) => !used.has(m.id));
}

/** leads sem nenhum pagamento e sem conversar há mais de N dias */
const abandonedLeads = (days: number) => ({ lastInteractionAt: { lt: cutoff(days) }, payments: { none: {} } });

/** quanto cada limpeza tiraria (não apaga nada) */
export async function previewCleanup(id: CleanupId, days: number): Promise<{ count: number; bytes?: number }> {
  const d = Math.max(days, MIN_DAYS[id]);
  if (id === "webhook_logs") return { count: await prisma.webhookLog.count({ where: { createdAt: { lt: cutoff(d) } } }) };
  if (id === "webhook_events") return { count: await prisma.webhookEvent.count({ where: { createdAt: { lt: cutoff(d) } } }) };
  if (id === "events") return { count: await prisma.event.count({ where: { createdAt: { lt: cutoff(d) } } }) };
  if (id === "media") {
    const list = await unusedMedia(d);
    return { count: list.length, bytes: list.reduce((n, m) => n + m.size, 0) };
  }
  return { count: await prisma.lead.count({ where: abandonedLeads(d) }) };
}

/** apaga em lotes; more = ainda há o que apagar (o painel chama de novo) */
export async function runCleanup(id: CleanupId, days: number): Promise<{ deleted: number; more: boolean }> {
  const d = Math.max(days, MIN_DAYS[id]);
  const started = Date.now();
  let deleted = 0;
  const loop = async (batch: () => Promise<number>) => {
    for (;;) {
      const n = await batch();
      deleted += n;
      if (n < BATCH) return false;
      if (Date.now() - started > TIME_BUDGET_MS) return true;
    }
  };
  const byIds = async (ids: string[], del: (ids: string[]) => Promise<{ count: number }>) => (ids.length ? (await del(ids)).count : 0);
  let more = false;
  if (id === "webhook_logs") {
    more = await loop(async () => {
      const ids = (await prisma.webhookLog.findMany({ where: { createdAt: { lt: cutoff(d) } }, select: { id: true }, take: BATCH })).map((r) => r.id);
      return byIds(ids, (ids) => prisma.webhookLog.deleteMany({ where: { id: { in: ids } } }));
    });
  } else if (id === "webhook_events") {
    more = await loop(async () => {
      const ids = (await prisma.webhookEvent.findMany({ where: { createdAt: { lt: cutoff(d) } }, select: { id: true }, take: BATCH })).map((r) => r.id);
      return byIds(ids, (ids) => prisma.webhookEvent.deleteMany({ where: { id: { in: ids } } }));
    });
  } else if (id === "events") {
    more = await loop(async () => {
      const ids = (await prisma.event.findMany({ where: { createdAt: { lt: cutoff(d) } }, select: { id: true }, take: BATCH })).map((r) => r.id);
      return byIds(ids, (ids) => prisma.event.deleteMany({ where: { id: { in: ids } } }));
    });
  } else if (id === "media") {
    const ids = (await unusedMedia(d)).map((m) => m.id);
    for (let i = 0; i < ids.length; i += 200) deleted += (await prisma.media.deleteMany({ where: { id: { in: ids.slice(i, i + 200) } } })).count;
  } else {
    // leads em lotes menores: cada um leva junto as conversas, mensagens, eventos e etiquetas
    more = await loop(async () => {
      const ids = (await prisma.lead.findMany({ where: abandonedLeads(d), select: { id: true }, take: BATCH })).map((r) => r.id);
      let n = 0;
      for (let i = 0; i < ids.length; i += 250) n += (await prisma.lead.deleteMany({ where: { id: { in: ids.slice(i, i + 250) } } })).count;
      return n;
    });
  }
  return { deleted, more };
}

const TABLE_OF: Record<CleanupId, string[]> = {
  webhook_logs: ["webhook_logs"],
  webhook_events: ["webhook_events"],
  events: ["events"],
  media: ["media"],
  leads: ["leads", "conversations", "messages", "events", "lead_tags"],
};

/** depois de apagar: o Postgres reaproveita o espaço e atualiza as estatísticas (não trava o site) */
export async function vacuumAfter(id: CleanupId): Promise<void> {
  for (const t of TABLE_OF[id]) {
    await prisma.$executeRawUnsafe(`VACUUM (ANALYZE) ${qt(t)}`).catch((e) => console.warn("[db-cleanup] vacuum", t, e));
  }
}
