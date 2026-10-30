import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { absoluteUrl } from "@/lib/paths";
import { EvolutionError, evolutionConfig, setWebhook, webhookToken } from "@/services/whatsapp/evolution";

// Liga o webhook da instância na Evolution (mensagens recebidas → este sistema)
export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    const cfg = evolutionConfig();
    if (!cfg) throw new HttpError(400, "Configure WHATSAPP_API_URL, WHATSAPP_API_KEY e WHATSAPP_INSTANCE na Vercel");
    const url = absoluteUrl(`/api/webhooks/whatsapp?token=${webhookToken(cfg)}`);
    try {
      await setWebhook(cfg, url);
    } catch (e) {
      throw new HttpError(502, e instanceof EvolutionError ? e.message : "Não foi possível falar com a Evolution");
    }
    return { ok: true };
  },
});
