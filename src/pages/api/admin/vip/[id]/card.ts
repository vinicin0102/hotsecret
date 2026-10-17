import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { vipPreviewCard } from "@/services/vip";

// Prévia do Grupo VIP para o preview do painel (mostra mesmo em rascunho)
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const card = await vipPreviewCard(String(req.query.id), { allowDraft: true });
    if (!card) throw new HttpError(404, "Grupo não encontrado");
    return { card };
  },
});
