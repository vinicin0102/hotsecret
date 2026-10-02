import type { LeadStage, Prisma } from "@prisma/client";
import { apiHandler, queryString, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const FILTERS: Record<string, LeadStage | undefined> = {
  novos: "NEW",
  interessados: "INTERESTED",
  checkout: "CHECKOUT",
  compradores: "BUYER",
  abandonaram: "ABANDONED",
};

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const filter = queryString(req.query.filter) ?? "todos";
    const q = (queryString(req.query.q) ?? "").trim().slice(0, 100);
    const funnelId = queryString(req.query.funnelId);
    const tagId = queryString(req.query.tagId);
    const page = Math.max(1, Number(queryString(req.query.page) ?? 1) || 1);
    const pageSize = 50;

    const where: Prisma.LeadWhereInput = {
      ...(FILTERS[filter] ? { stage: FILTERS[filter] } : {}),
      ...(funnelId ? { funnelId } : {}),
      ...(tagId ? { tags: { some: { tagId } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { utmCampaign: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, leads, counts] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        orderBy: { lastInteractionAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          funnel: { select: { name: true } },
          tags: { include: { tag: true } },
          payments: { where: { status: "APPROVED" }, select: { amount: true, product: { select: { name: true } } } },
        },
      }),
      prisma.lead.groupBy({ by: ["stage"], _count: true }),
    ]);

    return {
      total,
      page,
      pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.stage, c._count])),
      leads: leads.map((l) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        origin: l.utmSource ?? hostOf(l.referrer) ?? "direto",
        campaign: l.utmCampaign,
        funnel: l.funnel?.name ?? "—",
        currentNodeId: l.currentNodeId,
        stage: l.stage,
        tags: l.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
        purchase: l.payments.length ? { amount: l.payments.reduce((s, p) => s + p.amount, 0), product: l.payments[0].product.name } : null,
        lastInteractionAt: l.lastInteractionAt,
        createdAt: l.createdAt,
      })),
    };
  },
});
