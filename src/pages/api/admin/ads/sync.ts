// Tela Anúncios → "Atualizar agora": busca de novo na Meta o gasto do período (até 90 dias).
import { HttpError, apiHandler, requireAdmin } from "@/lib/api";
import { adsRange, localDay, syncAdSpend } from "@/services/ads/meta-ads";

export const config = { maxDuration: 60 };

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    const { from, to } = adsRange((req.body ?? {}) as Record<string, string>);
    const oldest = localDay(-89);
    if (to < oldest) throw new HttpError(400, "A Meta só devolve o gasto dos últimos 90 dias por aqui.");
    return syncAdSpend(from < oldest ? oldest : from, to);
  },
});
