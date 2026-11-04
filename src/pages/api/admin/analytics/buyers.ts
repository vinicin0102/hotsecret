// Analytics → Perfil dos compradores (recortes de leads × compradores do período). Resultado guardado 5 min.
import { apiHandler, parseRange, queryString, requireAdmin } from "@/lib/api";
import { heavyAdminQuery } from "@/lib/admin-query";
import { buyerProfile, profileHighlights } from "@/services/buyer-profile";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const { from, to } = parseRange(req.query);
    const funnelId = queryString(req.query.funnelId) || null;
    return heavyAdminQuery(`buyers:${JSON.stringify(req.query)}`, 300_000, async (db) => {
      const profile = await buyerProfile(from, to, funnelId, db);
      return { ...profile, highlights: profileHighlights(profile) };
    });
  },
});
