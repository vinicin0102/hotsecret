import { apiHandler, parseRange, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { campaigns, dailySeries, funnelSteps, revenue } from "@/services/analytics";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const id = String(req.query.id);
    const { from, to } = parseRange(req.query);
    const [funnel, steps, series, rev, byCampaign, buttonClicks] = await Promise.all([
      prisma.funnel.findUniqueOrThrow({ where: { id }, select: { id: true, name: true, slug: true } }),
      funnelSteps(from, to, id),
      dailySeries(from, to, id),
      revenue(from, to, id),
      campaigns(from, to, id),
      prisma.$queryRaw<{ nodeId: string; label: string; count: bigint }[]>`
        SELECT "nodeId", data->>'label' AS label, COUNT(*) AS count FROM events
        WHERE "funnelId" = ${id} AND type = 'button_clicked' AND "createdAt" BETWEEN ${from} AND ${to}
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30`,
    ]);
    return {
      funnel,
      steps,
      series,
      revenue: rev,
      campaigns: byCampaign,
      buttons: buttonClicks.map((b) => ({ nodeId: b.nodeId, label: b.label, count: Number(b.count) })),
    };
  },
});
