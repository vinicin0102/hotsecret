// Tela Anúncios (estilo UTMify): o gasto das contas de anúncios da Meta vem da API de Marketing (só leitura,
// permissão ads_read) e fica guardado por dia e anúncio; as vendas vêm do próprio sistema e são ligadas aos
// anúncios pelas UTMs (padrão "nome|id" da UTMify). O token fica criptografado e nunca volta ao navegador.
import { HttpError, queryString } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { openSecret, sealSecret } from "@/lib/secret-box";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH_URL = (process.env.META_GRAPH_URL || "https://graph.facebook.com").replace(/\/$/, "");
const KEY = "ad_accounts";
/** fuso das contas (BR): os dias do relatório da Meta vêm no fuso da conta */
export const ADS_TZ = "America/Sao_Paulo";

export interface AdAccount {
  /** act_123... */
  id: string;
  name?: string;
  currency?: string;
  /** token próprio desta conta (criptografado); sem ele, vale o token geral */
  tokenSealed?: string;
}
export interface AdsSettings {
  accounts: AdAccount[];
  /** token geral (usuário do sistema com acesso às contas), criptografado */
  tokenSealed?: string;
  /** taxa do gateway (%) e imposto (%) descontados do faturamento no lucro */
  feePercent?: number;
  taxPercent?: number;
  /** custo fixo por venda (centavos), ex.: taxa fixa do PIX */
  feeFixed?: number;
  /** última sincronização (ISO) e o dia mais antigo já sincronizado */
  lastSyncAt?: string;
  syncedSince?: string;
}

export async function getAdsSettings(): Promise<AdsSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const v = (row?.value ?? {}) as Partial<AdsSettings>;
  return { ...v, accounts: Array.isArray(v.accounts) ? v.accounts : [] };
}

export async function saveAdsSettings(s: AdsSettings) {
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s as object }, update: { value: s as object } });
}

export const sealToken = (t: string) => sealSecret(t);
export const tokenOf = (s: AdsSettings, a: AdAccount): string | null =>
  (a.tokenSealed && openSecret(a.tokenSealed)) || (s.tokenSealed && openSecret(s.tokenSealed)) || null;

/** "123", "act_123" ou o link do gerenciador → "act_123" */
export function normalizeAccountId(v: string): string | null {
  const m = /act[_=](\d{5,25})/.exec(v) ?? /^\s*(\d{5,25})\s*$/.exec(v);
  return m ? `act_${m[1]}` : null;
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH_URL}/${GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  return graphUrl<T>(url.toString());
}

async function graphUrl<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || j.error) {
    const msg = j.error?.message?.slice(0, 300) || `HTTP ${res.status}`;
    // a mensagem da Meta vai ao painel; o token nunca (ele só está na URL desta chamada)
    throw new Error(msg.replace(/access_token=[^&\s]+/g, "access_token=…"));
  }
  return j;
}

/** confere a conta (nome, moeda, situação) — usado ao salvar */
export async function checkAccount(id: string, token: string): Promise<{ name: string; currency: string; active: boolean }> {
  const r = await graph<{ name?: string; currency?: string; account_status?: number }>(id, token, { fields: "name,currency,account_status" });
  return { name: r.name ?? id, currency: r.currency ?? "BRL", active: r.account_status === 1 };
}

/** dia de hoje (YYYY-MM-DD) no fuso das contas, com deslocamento em dias */
export function localDay(offsetDays = 0, at = new Date()): string {
  const d = new Date(at.getTime() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: ADS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

interface InsightRow {
  date_start: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  clicks?: string;
}

/** gasto por dia e anúncio de uma conta, de since a until (inclusive), com paginação */
async function fetchInsights(accountId: string, token: string, since: string, until: string): Promise<InsightRow[]> {
  const out: InsightRow[] = [];
  let page = await graph<{ data?: InsightRow[]; paging?: { next?: string } }>(`${accountId}/insights`, token, {
    level: "ad",
    fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,inline_link_clicks,clicks",
    time_range: JSON.stringify({ since, until }),
    time_increment: "1",
    limit: "500",
  });
  for (let i = 0; i < 50; i++) {
    out.push(...(page.data ?? []));
    if (!page.paging?.next) break;
    page = await graphUrl(page.paging.next);
  }
  return out;
}

/**
 * Busca na Meta o gasto de since a until (dias no fuso da conta) de todas as contas e troca o que estava
 * guardado nesses dias. Uma conta com erro (token sem acesso) não impede as outras; o erro volta para o painel.
 */
export async function syncAdSpend(since: string, until: string): Promise<{ rows: number; errors: { account: string; error: string }[] }> {
  const s = await getAdsSettings();
  const errors: { account: string; error: string }[] = [];
  let rows = 0;
  for (const a of s.accounts) {
    const token = tokenOf(s, a);
    if (!token) {
      errors.push({ account: a.name || a.id, error: "Sem token: cadastre o token de acesso." });
      continue;
    }
    try {
      const data = await fetchInsights(a.id, token, since, until);
      const cents = (v?: string) => Math.round(Number(v ?? 0) * 100) || 0;
      const int = (v?: string) => Math.round(Number(v ?? 0)) || 0;
      const list = data
        .filter((r) => r.ad_id && r.date_start)
        .map((r) => ({
          day: r.date_start,
          accountId: a.id,
          campaignId: r.campaign_id ?? "",
          campaignName: (r.campaign_name ?? "").slice(0, 300),
          adsetId: r.adset_id ?? "",
          adsetName: (r.adset_name ?? "").slice(0, 300),
          adId: r.ad_id!,
          adName: (r.ad_name ?? "").slice(0, 300),
          spend: cents(r.spend),
          impressions: int(r.impressions),
          clicks: int(r.inline_link_clicks ?? r.clicks),
          currency: a.currency || "BRL",
        }));
      await prisma.$transaction([
        prisma.adSpend.deleteMany({ where: { accountId: a.id, day: { gte: since, lte: until } } }),
        prisma.adSpend.createMany({ data: list, skipDuplicates: true }),
      ]);
      rows += list.length;
    } catch (e) {
      errors.push({ account: a.name || a.id, error: e instanceof Error ? e.message : "Erro ao consultar a Meta" });
    }
  }
  const fresh = await getAdsSettings();
  await saveAdsSettings({
    ...fresh,
    lastSyncAt: new Date().toISOString(),
    syncedSince: !fresh.syncedSince || since < fresh.syncedSince ? since : fresh.syncedSince,
  });
  return { rows, errors };
}

/**
 * Antes de mostrar o relatório: hoje e ontem são atualizados se a última busca tem mais de 10 min; dias do
 * período que nunca foram buscados entram também (até 90 dias).
 */
export async function ensureFresh(from: string, to: string): Promise<{ errors: { account: string; error: string }[] } | null> {
  const s = await getAdsSettings();
  if (!s.accounts.length) return null;
  const today = localDay(0);
  const oldest = localDay(-89);
  // dias do período que nunca foram buscados (até 90 dias atrás): busca do início do período até hoje
  if (!s.syncedSince || from < s.syncedSince) return syncAdSpend(from < oldest ? oldest : from, today);
  // hoje e ontem mudam ao longo do dia: atualiza se a última busca tem mais de 10 min (e o período os inclui)
  const stale = !s.lastSyncAt || Date.now() - new Date(s.lastSyncAt).getTime() > 10 * 60_000;
  if (stale && to >= localDay(-1)) return syncAdSpend(localDay(-1), today);
  return null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** período em dias locais (Brasil): hoje, ontem, 7d, 30d, mês ou personalizado */
export function adsRange(q: Record<string, string | string[] | undefined>): { from: string; to: string } {
  const range = queryString(q.range) ?? "today";
  if (range === "custom") {
    const from = queryString(q.from) ?? "";
    const to = queryString(q.to) ?? "";
    if (!DAY.test(from) || !DAY.test(to) || from > to) throw new HttpError(400, "Período inválido");
    return { from, to };
  }
  if (range === "yesterday") return { from: localDay(-1), to: localDay(-1) };
  if (range === "7d") return { from: localDay(-6), to: localDay(0) };
  if (range === "30d") return { from: localDay(-29), to: localDay(0) };
  if (range === "month") return { from: `${localDay(0).slice(0, 8)}01`, to: localDay(0) };
  return { from: localDay(0), to: localDay(0) };
}

