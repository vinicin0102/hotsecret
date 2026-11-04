// Perfil dos compradores (Analytics): leads do período e quem comprou, cruzados por origem, campanha, anúncio,
// aparelho, região, horário de chegada etc. Uma passada só pela tabela de leads (os recortes saem juntos, com
// LATERAL VALUES) — roda no painel com o limite de tempo de lib/admin-query. Nada de dado pessoal sai daqui.
import { Prisma } from "@prisma/client";
import { tbl } from "@/lib/prisma";

type Db = Prisma.TransactionClient;

export type ProfileDim =
  | "all"
  | "source"
  | "campaign"
  | "adset"
  | "ad"
  | "pixel"
  | "device"
  | "os"
  | "browser"
  | "country"
  | "region"
  | "hour"
  | "weekday"
  | "timeToBuy"
  | "purchases";

export interface ProfileRow {
  value: string;
  leads: number;
  buyers: number;
  sales: number;
  /** centavos por moeda */
  revenue: { BRL: number; MXN: number; ARS: number };
}

export interface ProductRow {
  name: string;
  sales: number;
  buyers: number;
  revenue: { BRL: number; MXN: number; ARS: number };
}

export interface BuyerProfile {
  dims: Partial<Record<ProfileDim, ProfileRow[]>>;
  products: ProductRow[];
}

const TZ = Prisma.raw(`'America/Sao_Paulo'`);
const TEST = Prisma.raw(`('sandbox','preview')`);
/** recortes com muitos valores (campanhas, anúncios, regiões): os maiores */
const TOP = 15;

export async function buyerProfile(from: Date, to: Date, funnelId: string | null, db: Db): Promise<BuyerProfile> {
  const ff = funnelId ? Prisma.sql`AND l."funnelId" = ${funnelId}` : Prisma.empty;
  const rows = await db.$queryRaw<{ dim: ProfileDim; val: string; leads: number; buyers: number; sales: number; brl: bigint; mxn: bigint; ars: bigint }[]>`
    WITH l AS (
      SELECT l.id, l."createdAt", l."utmSource", l."utmMedium", l."utmCampaign", l."utmContent", l."adPixelId",
             l.device, l.os, l.browser, l.country, l.variables->>'_regiao' AS region
      FROM ${tbl("leads")} l
      WHERE l."createdAt" BETWEEN ${from} AND ${to} ${ff}
    ), p AS (
      SELECT p."leadId", COUNT(*)::int AS n, MIN(p."approvedAt") AS first_at,
             COALESCE(SUM(p.amount) FILTER (WHERE p.currency = 'BRL'), 0) AS brl,
             COALESCE(SUM(p.amount) FILTER (WHERE p.currency = 'MXN'), 0) AS mxn,
             COALESCE(SUM(p.amount) FILTER (WHERE p.currency = 'ARS'), 0) AS ars
      FROM ${tbl("payments")} p JOIN l ON l.id = p."leadId"
      WHERE p.status = 'APPROVED' AND p.provider NOT IN ${TEST}
      GROUP BY p."leadId"
    ), j AS (
      SELECT l.*, COALESCE(p.n, 0) AS n, p.first_at, COALESCE(p.brl, 0) AS brl, COALESCE(p.mxn, 0) AS mxn, COALESCE(p.ars, 0) AS ars,
             (l."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}) AS local_at
      FROM l LEFT JOIN p ON p."leadId" = l.id
    )
    SELECT d.dim, d.val,
           COUNT(*)::int AS leads,
           (COUNT(*) FILTER (WHERE j.n > 0))::int AS buyers,
           SUM(j.n)::int AS sales,
           SUM(j.brl)::bigint AS brl, SUM(j.mxn)::bigint AS mxn, SUM(j.ars)::bigint AS ars
    FROM j CROSS JOIN LATERAL (VALUES
      ('all', 'all'),
      ('source', COALESCE(NULLIF(j."utmSource", ''), '(direto)')),
      ('campaign', COALESCE(NULLIF(j."utmCampaign", ''), '(sem campanha)')),
      ('adset', NULLIF(j."utmMedium", '')),
      ('ad', NULLIF(j."utmContent", '')),
      ('pixel', j."adPixelId"),
      ('device', COALESCE(j.device, '(desconhecido)')),
      ('os', COALESCE(j.os, '(desconhecido)')),
      ('browser', COALESCE(j.browser, '(desconhecido)')),
      ('country', COALESCE(j.country, '(desconhecido)')),
      ('region', NULLIF(j.region, '')),
      ('hour', EXTRACT(HOUR FROM j.local_at)::int::text),
      ('weekday', EXTRACT(DOW FROM j.local_at)::int::text),
      ('timeToBuy', CASE
          WHEN j.first_at IS NULL THEN NULL
          WHEN j.first_at - j."createdAt" < interval '5 minutes' THEN '1'
          WHEN j.first_at - j."createdAt" < interval '15 minutes' THEN '2'
          WHEN j.first_at - j."createdAt" < interval '1 hour' THEN '3'
          WHEN j.first_at - j."createdAt" < interval '1 day' THEN '4'
          ELSE '5' END),
      ('purchases', CASE WHEN j.n = 0 THEN NULL WHEN j.n = 1 THEN '1' WHEN j.n = 2 THEN '2' ELSE '3+' END)
    ) AS d(dim, val)
    WHERE d.val IS NOT NULL
    GROUP BY d.dim, d.val`;

  const products = await db.$queryRaw<{ name: string; sales: number; buyers: number; brl: bigint; mxn: bigint; ars: bigint }[]>`
    SELECT pr.name, COUNT(*)::int AS sales, COUNT(DISTINCT p."leadId")::int AS buyers,
           COALESCE(SUM(p.amount) FILTER (WHERE p.currency = 'BRL'), 0)::bigint AS brl,
           COALESCE(SUM(p.amount) FILTER (WHERE p.currency = 'MXN'), 0)::bigint AS mxn,
           COALESCE(SUM(p.amount) FILTER (WHERE p.currency = 'ARS'), 0)::bigint AS ars
    FROM ${tbl("payments")} p
    JOIN ${tbl("leads")} l ON l.id = p."leadId"
    JOIN ${tbl("products")} pr ON pr.id = p."productId"
    WHERE p.status = 'APPROVED' AND p.provider NOT IN ${TEST} AND l."createdAt" BETWEEN ${from} AND ${to} ${ff}
    GROUP BY pr.name
    ORDER BY sales DESC
    LIMIT 30`;

  const money = (r: { brl: bigint; mxn: bigint; ars: bigint }) => ({ BRL: Number(r.brl), MXN: Number(r.mxn), ARS: Number(r.ars) });
  const dims: BuyerProfile["dims"] = {};
  for (const r of rows) {
    (dims[r.dim] ??= []).push({ value: r.val, leads: r.leads, buyers: r.buyers, sales: r.sales, revenue: money(r) });
  }
  const ordered = new Set<ProfileDim>(["hour", "weekday", "timeToBuy", "purchases"]);
  for (const [dim, list] of Object.entries(dims) as [ProfileDim, ProfileRow[]][]) {
    if (ordered.has(dim)) list.sort((a, b) => Number(a.value.replace("+", "")) - Number(b.value.replace("+", "")));
    else dims[dim] = list.sort((a, b) => b.buyers - a.buyers || b.leads - a.leads).slice(0, TOP);
  }
  return { dims, products: products.map((p) => ({ name: p.name, sales: p.sales, buyers: p.buyers, revenue: money(p) })) };
}

/**
 * Destaques: recortes que convertem bem acima (ou bem abaixo) da média, com amostra mínima para não enganar
 * (pelo menos 30 leads e, para os melhores, 3 compradores).
 */
export function profileHighlights(p: BuyerProfile): { best: Highlight[]; worst: Highlight[] } {
  const all = p.dims.all?.[0];
  if (!all || !all.leads || !all.buyers) return { best: [], worst: [] };
  const base = all.buyers / all.leads;
  const dims: ProfileDim[] = ["source", "campaign", "adset", "ad", "pixel", "device", "os", "browser", "country", "region", "hour", "weekday"];
  const items: Highlight[] = [];
  for (const dim of dims) {
    for (const r of p.dims[dim] ?? []) {
      if (r.leads < 30) continue;
      const conv = r.buyers / r.leads;
      items.push({ dim, value: r.value, leads: r.leads, buyers: r.buyers, conversion: conv, lift: conv / base });
    }
  }
  return {
    best: items.filter((i) => i.buyers >= 3 && i.lift >= 1.3).sort((a, b) => b.lift - a.lift).slice(0, 6),
    worst: items.filter((i) => i.leads >= 50 && i.lift <= 0.6).sort((a, b) => b.leads - a.leads).slice(0, 6),
  };
}

export interface Highlight {
  dim: ProfileDim;
  value: string;
  leads: number;
  buyers: number;
  conversion: number;
  /** quantas vezes a conversão média */
  lift: number;
}
