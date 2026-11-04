// Configurações → TikTok → "Enviar eventos de teste": manda 3 eventos com o código de teste (só aparecem em "Testar eventos").
import { apiHandler, getClientIp, requireAdmin } from "@/lib/api";
import { sendTiktokTestEvents } from "@/services/tiktok-events";

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    return sendTiktokTestEvents({ ip: getClientIp(req), userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400) || undefined });
  },
});
