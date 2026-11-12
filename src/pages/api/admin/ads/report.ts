// Tela Anúncios: relatório do período (gasto da Meta × vendas do sistema). Atualiza o gasto antes, se preciso.
import { apiHandler, queryString, requireAdmin } from "@/lib/api";
import { adsRange, ensureFresh } from "@/services/ads/meta-ads";
import { adsReport } from "@/services/ads/report";

export const config = { maxDuration: 60 };

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const { from, to } = adsRange(req.query);
    // a Meta fora do ar não impede o relatório: mostra o que já está guardado e o aviso
    const sync = await ensureFresh(from, to).catch((e) => ({ errors: [{ account: "Meta", error: e instanceof Error ? e.message : "erro" }] }));
    const report = await adsReport(from, to, queryString(req.query.account) || null);
    return { ...report, syncErrors: sync?.errors ?? [] };
  },
});
