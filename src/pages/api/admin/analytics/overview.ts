import { apiHandler, parseRange, queryString, requireAdmin } from "@/lib/api";
import { campaigns, funnelSteps, revenue } from "@/services/analytics";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const { from, to } = parseRange(req.query);
    const funnelId = queryString(req.query.funnelId) || null;
    const [steps, rev, byCampaign] = await Promise.all([
      funnelSteps(from, to, funnelId),
      revenue(from, to, funnelId),
      campaigns(from, to, funnelId),
    ]);
    return { steps, revenue: rev, campaigns: byCampaign };
  },
});
