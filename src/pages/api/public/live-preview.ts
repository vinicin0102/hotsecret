// Canal VIP AO VIVO: o lead tocou em "Ver prévia" → libera a próxima prévia (foto, vídeo, áudio ou o card do
// Grupo VIP como bônus), uma por vez.
// Os arquivos das prévias nunca vão na página: cada um só sai daqui, na ordem, e fica gravado na conversa.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler, HttpError, leadRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { getFunnelSettings } from "@/services/funnels";
import { addConversationMessage } from "@/services/payments/service";
import { trackEvent } from "@/services/tracking";
import { vipPreviewCard } from "@/services/vip";
import { livePreviewReady } from "@/types/flow";

const schema = z.object({ token: z.string().min(10).max(2000) });

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "live-preview", 30, 60_000);
    const { token } = schema.parse(req.body);
    const session = await requireLeadSession(token);
    const funnel = await prisma.funnel.findUnique({ where: { id: session.funnelId }, select: { settings: true } });
    const live = getFunnelSettings(funnel?.settings).live;
    const previews = (live.enabled ? (live.previews ?? []) : []).filter(livePreviewReady);
    if (!previews.length) throw new HttpError(404, "Sem prévias");

    // a próxima é a que ainda não foi liberada nesta conversa
    const media = await prisma.message.findMany({
      where: { conversationId: session.conversationId, sender: "bot", type: { in: ["image", "video", "audio", "vip_preview"] } },
      select: { content: true },
    });
    const shown = media.filter((m) => !!(m.content as { livePreview?: unknown } | null)?.livePreview).length;
    if (shown >= previews.length) throw new HttpError(410, "Acabaram as prévias");
    const p = previews[shown];
    const conv = await prisma.conversation.findUnique({ where: { id: session.conversationId }, select: { currentNodeId: true } });
    const livePreview = { n: shown + 1, total: previews.length };
    let type: string = p.kind;
    let content: Record<string, unknown> = { url: p.url, caption: p.caption ?? "", livePreview };
    if (p.kind === "vip") {
      // card do Grupo VIP como bônus (a legenda é a frase do bônus); grupo despublicado: não libera
      const card = p.groupId ? await vipPreviewCard(p.groupId, { bonusText: p.caption }) : null;
      if (!card) {
        console.warn(`[live-preview] prévia do Grupo VIP sem grupo publicado (${p.groupId ?? "—"})`);
        throw new HttpError(404, "Prévia indisponível");
      }
      type = "vip_preview";
      content = { ...card, livePreview };
    }
    const msg = await addConversationMessage(session.conversationId, "bot", type, content as Prisma.InputJsonValue, conv?.currentNodeId ?? null);
    await trackEvent({
      leadId: session.leadId,
      funnelId: session.funnelId,
      conversationId: session.conversationId,
      type: "live_preview",
      nodeId: conv?.currentNodeId ?? null,
      data: { n: shown + 1, total: previews.length, kind: p.kind },
    });
    return { message: { id: msg.id, type, content, createdAt: msg.createdAt.toISOString() } };
  },
});
