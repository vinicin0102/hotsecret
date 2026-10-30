import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { absoluteUrl } from "@/lib/paths";
import { PROVIDER_LABEL, isProviderError, setWebhook, waConfig, webhookToken } from "@/services/whatsapp/client";

// Liga o webhook da instância (Evolution ou uazapi): mensagens recebidas → este sistema
export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    const cfg = waConfig();
    if (!cfg) throw new HttpError(400, "Configure as variáveis do WhatsApp na Vercel");
    const url = absoluteUrl(`/api/webhooks/whatsapp?token=${webhookToken(cfg)}`);
    try {
      await setWebhook(cfg, url);
    } catch (e) {
      throw new HttpError(502, isProviderError(e) ? e.message : `Não foi possível falar com a ${PROVIDER_LABEL[cfg.provider]}`);
    }
    return { ok: true };
  },
});
