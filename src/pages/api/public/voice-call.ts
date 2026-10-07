// Ligação de voz do Cérebro: o lead atendeu e a ligação terminou → registra e devolve a mensagem final + a oferta.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";
import { addConversationMessage } from "@/services/payments/service";
import { trackEvent } from "@/services/tracking";
import { brainOffers, brainVoiceCalls } from "@/services/ai/brain";
import type { AiContent } from "@/types/flow";

const schema = z.object({
  token: z.string().min(10).max(2000),
  nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/),
  callId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/),
  /** quanto tempo o lead ficou na ligação */
  seconds: z.number().int().min(0).max(4 * 60 * 60).default(0),
});

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "voice-call", 20, 60_000);
    const { token, nodeId, callId, seconds } = schema.parse(req.body);
    const session = await requireLeadSession(token);
    const { graph, locked, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "ai") throw new HttpError(404, "Bloco não encontrado");
    if (locked.has(node.id) && !unlocked.has(node.id)) throw new HttpError(403, "Conteúdo bloqueado");
    const brainId = (node.content as AiContent).brainId;
    const brain = brainId ? await prisma.brain.findUnique({ where: { id: brainId } }) : null;
    const call = brain ? brainVoiceCalls(brain).find((v) => v.id === callId) : undefined;
    if (!brain || !call) throw new HttpError(404, "Ligação não encontrada");

    // a ligação precisa ter sido feita pela IA nesta conversa (e só fecha uma vez)
    const msgs = await prisma.message.findMany({ where: { conversationId: session.conversationId, type: "voice_call" }, select: { content: true } });
    const status = (m: { content: unknown }) => (m.content as { status?: string; callId?: string } | null) ?? {};
    if (!msgs.some((m) => status(m).status === "ringing" && status(m).callId === callId)) throw new HttpError(404, "Ligação não encontrada");
    if (msgs.some((m) => status(m).status === "ended" && status(m).callId === callId)) return { endText: null, offer: null };

    await addConversationMessage(session.conversationId, "user", "voice_call", { status: "ended", callId, seconds, text: `Atendeu a ligação de voz (${seconds}s)` }, node.id);
    await trackEvent({ leadId: session.leadId, funnelId: session.funnelId, conversationId: session.conversationId, type: "voice_call_ended", nodeId: node.id, data: { callId, seconds } });

    const endText = call.endText?.trim() || null;
    if (endText) await addConversationMessage(session.conversationId, "bot", "text", { text: endText }, node.id);

    // oferta do fim da ligação: card de compra do produto escolhido (ex.: chamada de vídeo)
    const o = call.offerId ? brainOffers(brain).find((x) => x.id === call.offerId) : undefined;
    const p = o ? await prisma.product.findFirst({ where: { id: o.productId, active: true } }) : null;
    if (!o || !p) return { endText, offer: null };
    const offer = { productId: p.id, headline: o.headline || p.name, ctaLabel: o.ctaLabel || undefined, style: "card" as const };
    await addConversationMessage(
      session.conversationId,
      "bot",
      "offer",
      { productId: p.id, name: p.name, headline: offer.headline, ctaLabel: offer.ctaLabel ?? null, price: p.price, originalPrice: p.originalPrice, aiOfferId: o.id, style: "card" } as Prisma.InputJsonValue,
      node.id,
    );
    await trackEvent({ leadId: session.leadId, funnelId: session.funnelId, conversationId: session.conversationId, type: "offer_viewed", nodeId: node.id, data: { productId: p.id, ai: true, voiceCall: callId } });
    return { endText, offer };
  },
});
