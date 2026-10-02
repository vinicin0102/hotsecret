// Métricas do funil calculadas a partir da tabela de eventos (leads distintos por etapa).
import { Prisma } from "@prisma/client";
import { prisma, tbl } from "@/lib/prisma";

export const FUNNEL_STEPS = [
  { key: "page_view", label: "Visitantes" },
  { key: "chat_started", label: "Conversas iniciadas" },
  { key: "button_clicked", label: "Botões clicados" },
  { key: "offer_viewed", label: "Oferta visualizada" },
  { key: "checkout_started", label: "Checkout" },
  { key: "payment_approved", label: "Pagamento" },
] as const;

const TZ = "America/Sao_Paulo";

function funnelFilter(funnelId?: string | null) {
  return funnelId ? Prisma.sql`AND "funnelId" = ${funnelId}` : Prisma.empty;
}

export async function distinctLeadsByType(from: Date, to: Date, funnelId?: string | null) {
  const rows = await prisma.$queryRaw<{ type: string; count: bigint }[]>`
    SELECT type, COUNT(DISTINCT "leadId") AS count
    FROM ${tbl("events")}
    WHERE "createdAt" BETWEEN ${from} AND ${to} ${funnelFilter(funnelId)}
    GROUP BY type`;
  return Object.fromEntries(rows.map((r) => [r.type, Number(r.count)])) as Record<string, number>;
}

export async function funnelSteps(from: Date, to: Date, funnelId?: string | null) {
  const counts = await distinctLeadsByType(from, to, funnelId);
  return FUNNEL_STEPS.map((s, i) => {
    const value = counts[s.key] ?? 0;
    const prev = i === 0 ? value : counts[FUNNEL_STEPS[i - 1].key] ?? 0;
    const first = counts[FUNNEL_STEPS[0].key] ?? 0;
    return {
      key: s.key,
      label: s.label,
      value,
      rateFromPrevious: i === 0 ? 1 : prev ? value / prev : 0,
      rateFromStart: first ? value / first : 0,
    };
  });
}

export async function revenue(from: Date, to: Date, funnelId?: string | null) {
  const agg = await prisma.payment.aggregate({
    where: { status: "APPROVED", approvedAt: { gte: from, lte: to }, ...(funnelId ? { funnelId } : {}) },
    _sum: { amount: true },
    _count: true,
  });
  return { amount: agg._sum.amount ?? 0, count: agg._count };
}

export async function dailySeries(from: Date, to: Date, funnelId?: string | null) {
  const rows = await prisma.$queryRaw<{ day: Date; type: string; count: bigint }[]>`
    SELECT date_trunc('day', "createdAt" AT TIME ZONE ${TZ}) AS day, type, COUNT(DISTINCT "leadId") AS count
    FROM ${tbl("events")}
    WHERE "createdAt" BETWEEN ${from} AND ${to}
      AND type IN ('page_view','chat_started','checkout_started','payment_approved')
      ${funnelFilter(funnelId)}
    GROUP BY 1, 2
    ORDER BY 1`;
  const byDay = new Map<string, { date: string; visitantes: number; conversas: number; checkout: number; vendas: number }>();
  const cursor = new Date(from);
  while (cursor <= to) {
    const key = cursor.toLocaleDateString("en-CA", { timeZone: TZ });
    byDay.set(key, { date: key, visitantes: 0, conversas: 0, checkout: 0, vendas: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  const field: Record<string, "visitantes" | "conversas" | "checkout" | "vendas"> = {
    page_view: "visitantes",
    chat_started: "conversas",
    checkout_started: "checkout",
    payment_approved: "vendas",
  };
  for (const r of rows) {
    const key = new Date(r.day).toISOString().slice(0, 10);
    const entry = byDay.get(key) ?? { date: key, visitantes: 0, conversas: 0, checkout: 0, vendas: 0 };
    entry[field[r.type]] = Number(r.count);
    byDay.set(key, entry);
  }
  return [...byDay.values()];
}

export async function dashboard(from: Date, to: Date) {
  const [counts, rev, series] = await Promise.all([
    distinctLeadsByType(from, to),
    revenue(from, to),
    dailySeries(from, to),
  ]);
  return {
    cards: {
      visitors: counts.page_view ?? 0,
      conversations: counts.chat_started ?? 0,
      checkouts: counts.checkout_started ?? 0,
      sales: rev.count,
      revenue: rev.amount,
    },
    series,
  };
}

/** Visitantes, vendas e conversão por fluxo (lista de fluxos). */
export async function funnelSummaries(from?: Date) {
  const since = from ?? new Date(0);
  const rows = await prisma.$queryRaw<{ funnelId: string; visitors: bigint; sales: bigint }[]>`
    SELECT f.id AS "funnelId",
      (SELECT COUNT(DISTINCT e."leadId") FROM ${tbl("events")} e WHERE e."funnelId" = f.id AND e.type = 'page_view' AND e."createdAt" >= ${since}) AS visitors,
      (SELECT COUNT(*) FROM ${tbl("payments")} p WHERE p."funnelId" = f.id AND p.status = 'APPROVED' AND p."createdAt" >= ${since}) AS sales
    FROM ${tbl("funnels")} f`;
  return Object.fromEntries(
    rows.map((r) => [r.funnelId, { visitors: Number(r.visitors), sales: Number(r.sales) }]),
  ) as Record<string, { visitors: number; sales: number }>;
}

/** Vendas por campanha (UTM). */
export async function campaigns(from: Date, to: Date, funnelId?: string | null) {
  const ff = funnelId ? Prisma.sql`AND l."funnelId" = ${funnelId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<
    { source: string | null; campaign: string | null; leads: bigint; checkouts: bigint; sales: bigint; revenue: bigint | null }[]
  >`
    SELECT l."utmSource" AS source, l."utmCampaign" AS campaign,
      COUNT(DISTINCT l.id) AS leads,
      COUNT(DISTINCT l.id) FILTER (WHERE l.stage IN ('CHECKOUT','ABANDONED','BUYER')) AS checkouts,
      COUNT(DISTINCT p.id) AS sales,
      COALESCE(SUM(p.amount), 0) AS revenue
    FROM ${tbl("leads")} l
    LEFT JOIN ${tbl("payments")} p ON p."leadId" = l.id AND p.status = 'APPROVED'
    WHERE l."createdAt" BETWEEN ${from} AND ${to} ${ff}
    GROUP BY 1, 2
    ORDER BY sales DESC, leads DESC
    LIMIT 100`;
  return rows.map((r) => ({
    source: r.source ?? "(direto)",
    campaign: r.campaign ?? "(sem campanha)",
    leads: Number(r.leads),
    checkouts: Number(r.checkouts),
    sales: Number(r.sales),
    revenue: Number(r.revenue ?? 0),
  }));
}

/** Comparação A/B por variante: CTR (início de conversa), checkout, vendas, conversão. */
export async function experimentReport(experimentId: string) {
  const variants = await prisma.experimentVariant.findMany({
    where: { experimentId },
    include: { funnel: { select: { name: true, slug: true } } },
  });
  const rows = await prisma.$queryRaw<{ variantId: string; type: string; count: bigint }[]>`
    SELECT l."variantId", e.type, COUNT(DISTINCT e."leadId") AS count
    FROM ${tbl("events")} e JOIN ${tbl("leads")} l ON l.id = e."leadId"
    WHERE l."experimentId" = ${experimentId}
      AND e.type IN ('page_view','chat_started','checkout_started','payment_approved')
    GROUP BY 1, 2`;
  const rev = await prisma.$queryRaw<{ variantId: string; revenue: bigint }[]>`
    SELECT l."variantId", COALESCE(SUM(p.amount),0) AS revenue
    FROM ${tbl("payments")} p JOIN ${tbl("leads")} l ON l.id = p."leadId"
    WHERE l."experimentId" = ${experimentId} AND p.status = 'APPROVED'
    GROUP BY 1`;
  return variants.map((v) => {
    const get = (t: string) => Number(rows.find((r) => r.variantId === v.id && r.type === t)?.count ?? 0);
    const visitors = get("page_view");
    const sales = get("payment_approved");
    return {
      variantId: v.id,
      label: v.label,
      weight: v.weight,
      funnelName: v.funnel.name,
      visitors,
      chatStarted: get("chat_started"),
      checkouts: get("checkout_started"),
      sales,
      revenue: Number(rev.find((r) => r.variantId === v.id)?.revenue ?? 0),
      conversion: visitors ? sales / visitors : 0,
      ctr: visitors ? get("chat_started") / visitors : 0,
    };
  });
}
