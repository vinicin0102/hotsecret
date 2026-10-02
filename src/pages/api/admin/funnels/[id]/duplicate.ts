import { apiHandler, requireAdmin } from "@/lib/api";
import { duplicateFunnel } from "@/services/funnels";

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    const funnel = await duplicateFunnel(String(req.query.id));
    return { funnel };
  },
});
