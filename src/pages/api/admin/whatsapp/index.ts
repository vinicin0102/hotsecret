import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/paths";
import { PROVIDER_LABEL, connectionState, missingWaEnv, waConfig, webhookToken } from "@/services/whatsapp/client";
import { getWhatsAppSettings, saveWhatsAppSettings } from "@/services/whatsapp/settings";

// WhatsApp (Evolution API ou uazapi): estado da conexão, endereço do webhook, configurações e contatos
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const cfg = waConfig();
    let state: string | null = null;
    let stateError: string | null = null;
    if (cfg) {
      try {
        state = await connectionState(cfg);
      } catch (e) {
        stateError = e instanceof Error ? e.message.slice(0, 200) : "Erro ao consultar o serviço do WhatsApp";
      }
    }
    const contacts = await prisma.whatsAppContact.findMany({ orderBy: { lastInboundAt: "desc" }, take: 60 });
    const last = await Promise.all(
      contacts.map((c) =>
        prisma.message.findFirst({ where: { conversationId: c.conversationId }, orderBy: { createdAt: "desc" }, select: { sender: true, content: true, createdAt: true } }),
      ),
    );
    return {
      configured: !!cfg,
      missing: missingWaEnv(),
      provider: cfg ? PROVIDER_LABEL[cfg.provider] : null,
      instance: cfg?.instance || null,
      state,
      stateError,
      webhookUrl: cfg ? absoluteUrl(`/api/webhooks/whatsapp?token=${webhookToken(cfg)}`) : null,
      settings: await getWhatsAppSettings(),
      contacts: contacts.map((c, i) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        leadId: c.leadId,
        paused: c.paused,
        pausedUntil: c.pausedUntil,
        lastInboundAt: c.lastInboundAt,
        last: last[i] ? { sender: last[i]!.sender, text: String((last[i]!.content as { text?: unknown })?.text ?? "").slice(0, 120), at: last[i]!.createdAt } : null,
      })),
    };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    return { settings: await saveWhatsAppSettings(req.body) };
  },
});
