import { apiHandler, parseRange, queryString, requireAdmin } from "@/lib/api";
import { campaigns, funnelSteps, revenue } from "@/services/analytics";
import { heavyAdminQuery } from "@/lib/admin-query";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const { from, to } = parseRange(req.query);
    const funnelId = queryString(req.query.funnelId) || null;
    return heavyAdminQuery(`overview:${JSON.stringify(req.query)}`, 180_000, async (db) => {
      const [steps, rev, byCampaign] = await Promise.all([funnelSteps(from, to, funnelId, db), revenue(from, to, funnelId, db), campaigns(from, to, funnelId, db)]);
      return { steps, revenue: rev, campaigns: byCampaign };
    });
  },
});
