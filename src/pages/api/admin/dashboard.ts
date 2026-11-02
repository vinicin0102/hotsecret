import { apiHandler, parseRange, requireAdmin } from "@/lib/api";
import { dashboard } from "@/services/analytics";
import { heavyAdminQuery } from "@/lib/admin-query";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const { from, to } = parseRange(req.query);
    // mesmo período: o resultado de até 3 min atrás (o painel não refaz as contagens a cada abertura)
    return heavyAdminQuery(`dashboard:${JSON.stringify(req.query)}`, 180_000, (db) => dashboard(from, to, db));
  },
});
