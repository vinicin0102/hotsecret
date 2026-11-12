// Relatório da tela Anúncios: gasto (Meta) × leads, PIX gerados e vendas do sistema, por campanha → conjunto →
// anúncio. A venda é ligada ao anúncio pelas UTMs do lead (UTMify: utm_campaign = "nome|id", utm_medium =
// conjunto, utm_content = anúncio): pelo id quando houver, senão pelo nome. Vendas de teste ficam de fora.
import { prisma } from "@/lib/prisma";
import { getAdsSettings } from "./meta-ads";

export type Money = Record<string, number>;

export interface Metrics {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  checkouts: number;
  sales: number;
  /** centavos por moeda */
  revenue: Money;
}
export interface AdNode extends Metrics {
  key: string;
  id: string;
  name: string;
}
export interface AdsetNode extends AdNode {
  ads: AdNode[];
}
export interface CampaignNode extends AdNode {
  adsets: AdsetNode[];
}
export interface AdsReport {
  from: string;
  to: string;
  currency: string;
  totals: Metrics & { fees: number; profit: number };
  campaigns: CampaignNode[];
  /** vendas sem campanha identificável nas UTMs, por utm_source */
  untracked: { source: string; sales: number; revenue: Money }[];
  products: { name: string; sales: number; revenue: Money }[];
  days: { day: string; spend: number; sales: number; revenue: Money }[];
  settings: { feePercent: number; taxPercent: number; feeFixed: number; connected: boolean };
}

const TEST = ["sandbox", "preview"];
const empty = (): Metrics => ({ spend: 0, impressions: 0, clicks: 0, leads: 0, checkouts: 0, sales: 0, revenue: {} });
const addMoney = (m: Money, cur: string, v: number) => (m[cur] = (m[cur] ?? 0) + v);

/** "Nome do anúncio|1234567890" → { name, id }; sem id, só o nome */
export function parseUtm(v?: string | null): { name: string; id: string } | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  const i = s.lastIndexOf("|");
  if (i > 0) {
    const id = s.slice(i + 1).trim();
    if (/^\d{5,30}$/.test(id)) return { name: s.slice(0, i).trim(), id };
  }
  return { name: s, id: "" };
}

/** início e fim (UTC) dos dias locais do relatório (Brasil, UTC−3) */
export const dayStart = (day: string) => new Date(`${day}T00:00:00.000-03:00`);
export const dayEnd = (day: string) => new Date(`${day}T23:59:59.999-03:00`);
const localDayOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

type Utms = { utmSource: string | null; utmCampaign: string | null; utmMedium: string | null; utmContent: string | null };

export async function adsReport(from: string, to: string, accountId?: string | null): Promise<AdsReport> {
  const settings = await getAdsSettings();
  const start = dayStart(from);
  const end = dayEnd(to);
  const leadSel = { utmSource: true, utmCampaign: true, utmMedium: true, utmContent: true } as const;
  const [spendRows, sales, checkouts, leadGroups] = await Promise.all([
    prisma.adSpend.findMany({ where: { day: { gte: from, lte: to }, ...(accountId ? { accountId } : {}) } }),
    prisma.payment.findMany({
      where: { status: "APPROVED", provider: { notIn: TEST }, approvedAt: { gte: start, lte: end } },
      select: { amount: true, currency: true, approvedAt: true, product: { select: { name: true } }, lead: { select: leadSel } },
    }),
    prisma.payment.findMany({
      where: { provider: { notIn: TEST }, createdAt: { gte: start, lte: end } },
      select: { lead: { select: leadSel } },
    }),
    prisma.lead.groupBy({ by: ["utmSource", "utmCampaign", "utmMedium", "utmContent"], where: { createdAt: { gte: start, lte: end } }, _count: { _all: true } }),
  ]);

  // ---- árvore a partir do gasto ----
  const campaigns = new Map<string, CampaignNode>();
  const adsets = new Map<string, AdsetNode>();
  const ads = new Map<string, AdNode>();
  /** nome (minúsculo) → chave, para UTMs sem id */
  const byName = { campaign: new Map<string, string>(), adset: new Map<string, string>(), ad: new Map<string, string>() };
  const node = <T extends AdNode>(map: Map<string, T>, key: string, id: string, name: string, extra: object): T => {
    let n = map.get(key);
    if (!n) {
      n = { key, id, name, ...empty(), ...extra } as T;
      map.set(key, n);
    }
    return n;
  };
  const currencies: Money = {};
  for (const r of spendRows) {
    const c = node(campaigns, `c:${r.campaignId}`, r.campaignId, r.campaignName, { adsets: [] });
    const s = node(adsets, `s:${r.adsetId}`, r.adsetId, r.adsetName, { ads: [] });
    const a = node(ads, `a:${r.adId}`, r.adId, r.adName, {});
    if (!c.adsets.includes(s)) c.adsets.push(s);
    if (!s.ads.includes(a)) s.ads.push(a);
    for (const n of [c, s, a]) {
      n.spend += r.spend;
      n.impressions += r.impressions;
      n.clicks += r.clicks;
    }
    byName.campaign.set(r.campaignName.toLowerCase(), c.key);
    byName.adset.set(r.adsetName.toLowerCase(), s.key);
    byName.ad.set(r.adName.toLowerCase(), a.key);
    addMoney(currencies, r.currency, r.spend);
  }
  const currency = Object.entries(currencies).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "BRL";

  /** nós da campanha/conjunto/anúncio de um lead (criados pelas UTMs se o gasto não tiver) */
  const locate = (u: Utms | null) => {
    const pc = parseUtm(u?.utmCampaign);
    if (!pc) return null;
    const ck = (pc.id && campaigns.has(`c:${pc.id}`) ? `c:${pc.id}` : byName.campaign.get(pc.name.toLowerCase())) ?? `c:${pc.id || `n:${pc.name.toLowerCase()}`}`;
    const c = node(campaigns, ck, pc.id, pc.name, { adsets: [] });
    const ps = parseUtm(u?.utmMedium);
    let s: AdsetNode | null = null;
    if (ps) {
      const sk = (ps.id && adsets.has(`s:${ps.id}`) ? `s:${ps.id}` : byName.adset.get(ps.name.toLowerCase())) ?? `s:${ps.id || `n:${ck}:${ps.name.toLowerCase()}`}`;
      s = node(adsets, sk, ps.id, ps.name, { ads: [] });
      if (!c.adsets.includes(s)) c.adsets.push(s);
    }
    const pa = parseUtm(u?.utmContent);
    let a: AdNode | null = null;
    if (pa && s) {
      const ak = (pa.id && ads.has(`a:${pa.id}`) ? `a:${pa.id}` : byName.ad.get(pa.name.toLowerCase())) ?? `a:${pa.id || `n:${s.key}:${pa.name.toLowerCase()}`}`;
      a = node(ads, ak, pa.id, pa.name, {});
      if (!s.ads.includes(a)) s.ads.push(a);
    }
    return [c, s, a].filter((n): n is AdNode => !!n);
  };

  const totals = { ...empty(), fees: 0, profit: 0 };
  totals.spend = spendRows.reduce((t, r) => t + r.spend, 0);
  totals.impressions = spendRows.reduce((t, r) => t + r.impressions, 0);
  totals.clicks = spendRows.reduce((t, r) => t + r.clicks, 0);

  for (const g of leadGroups) {
    const n = g._count._all;
    totals.leads += n;
    for (const x of locate(g) ?? []) x.leads += n;
  }
  for (const p of checkouts) {
    totals.checkouts++;
    for (const x of locate(p.lead) ?? []) x.checkouts++;
  }

  const untracked = new Map<string, { source: string; sales: number; revenue: Money }>();
  const products = new Map<string, { name: string; sales: number; revenue: Money }>();
  const days = new Map<string, { day: string; spend: number; sales: number; revenue: Money }>();
  const dayOf = (d: string) => days.get(d) ?? (days.set(d, { day: d, spend: 0, sales: 0, revenue: {} }), days.get(d)!);
  for (const r of spendRows) dayOf(r.day).spend += r.spend;
  for (const p of sales) {
    const cur = p.currency || "BRL";
    totals.sales++;
    addMoney(totals.revenue, cur, p.amount);
    const hit = locate(p.lead);
    if (hit) {
      for (const x of hit) {
        x.sales++;
        addMoney(x.revenue, cur, p.amount);
      }
    } else {
      const src = p.lead?.utmSource?.trim() || "(direto / sem UTM)";
      const u = untracked.get(src) ?? (untracked.set(src, { source: src, sales: 0, revenue: {} }), untracked.get(src)!);
      u.sales++;
      addMoney(u.revenue, cur, p.amount);
    }
    const name = p.product?.name ?? "Produto";
    const pr = products.get(name) ?? (products.set(name, { name, sales: 0, revenue: {} }), products.get(name)!);
    pr.sales++;
    addMoney(pr.revenue, cur, p.amount);
    if (p.approvedAt) {
      const d = dayOf(localDayOf(p.approvedAt));
      d.sales++;
      addMoney(d.revenue, cur, p.amount);
    }
  }

  // lucro na moeda da conta: faturamento − taxa do gateway − imposto − taxa fixa por venda − gasto
  const feePercent = settings.feePercent ?? 0;
  const taxPercent = settings.taxPercent ?? 0;
  const feeFixed = settings.feeFixed ?? 0;
  const rev = totals.revenue[currency] ?? 0;
  totals.fees = Math.round(rev * (feePercent + taxPercent) / 100) + feeFixed * totals.sales;
  totals.profit = rev - totals.fees - totals.spend;

  const bySpend = <T extends AdNode>(l: T[]) => l.sort((a, b) => b.spend - a.spend || b.sales - a.sales);
  const list = bySpend([...campaigns.values()]);
  for (const c of list) {
    bySpend(c.adsets);
    for (const s of c.adsets) bySpend(s.ads);
  }
  return {
    from,
    to,
    currency,
    totals,
    campaigns: list,
    untracked: [...untracked.values()].sort((a, b) => b.sales - a.sales),
    products: [...products.values()].sort((a, b) => b.sales - a.sales),
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    settings: { feePercent, taxPercent, feeFixed, connected: settings.accounts.length > 0 },
  };
}
