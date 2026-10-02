import { apiHandler, parseRange, requireAdmin } from "@/lib/api";
import { dashboard } from "@/services/analytics";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const { from, to } = parseRange(req.query);
    return dashboard(from, to);
  },
});
