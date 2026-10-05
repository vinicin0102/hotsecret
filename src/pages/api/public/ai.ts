// Bloco Cérebro: a IA responde o lead. A chave da API fica só no servidor; preços e ofertas vêm do banco.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";
import { addConversationMessage } from "@/services/payments/service";
import { trackEvent } from "@/services/tracking";
import { describeAiError, runBrain, type ChatTurn } from "@/services/ai/brain";
import { formatBRL } from "@/lib/format";
import type { AiContent } from "@/types/flow";

export const config = { maxDuration: 60 };

const schema = z.object({
  token: z.string().min(10).max(2000),
  nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/),
  message: z.string().max(2000).optional(),
  /** a IA puxa a conversa (bloco com "A IA puxa a conversa") */
  start: z.boolean().optional(),
  /** algo que o lead fez no chat (ex.: recusou a chamada de vídeo) */
  event: z.enum(["call_declined"]).optional(),
});

type Msg = { sender: string; type: string; content: unknown };

/** Histórico da conversa em texto para a IA (inclui o roteiro do fluxo antes do Cérebro). */
function toTurns(messages: Msg[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    const c = (m.content ?? {}) as Record<string, unknown>;
    const text = typeof c.text === "string" ? c.text : "";
    switch (m.type) {
      case "text":
        if (text) turns.push({ role: m.sender === "user" ? "lead" : "bot", text });
        break;
      case "buttons":
        turns.push({ role: "bot", text: `${text}${Array.isArray(c.buttons) && c.buttons.length ? ` [opções: ${(c.buttons as string[]).join(" / ")}]` : ""}` });
        break;
      case "image":
      case "video":
        turns.push({ role: "bot", text: `[enviou ${m.type === "image" ? "uma foto" : "um vídeo"}${c.caption ? `: ${String(c.caption)}` : ""}]` });
        break;
      case "audio":
        turns.push({ role: "bot", text: `[enviou um áudio${c.aiAudioId ? ` (audio_id "${String(c.aiAudioId)}")` : ""}]` });
        break;
      case "offer":
        turns.push({
          role: "bot",
          text: `[${c.style === "call" ? "ligou para o lead (chamada de vídeo) com a oferta" : "mostrou o card da oferta"} ${String(c.headline || c.name || "")} — ${typeof c.price === "number" ? formatBRL(c.price) : ""}${c.aiOfferId ? ` (offer_id "${String(c.aiOfferId)}")` : ""}]`,
        });
        break;
      case "checkout":
        turns.push({ role: "lead", text: "[tocou no botão para comprar e gerou o PIX]" });
        break;
      case "call_declined":
        turns.push({ role: "lead", text: "[recusou a chamada de vídeo]" });
        break;
      case "payment_update":
        if (text) turns.push({ role: "bot", text: `[sistema: ${text}]` });
        break;
      default:
        break;
    }
  }
  return turns;
}

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "ai-chat", 20, 60_000);
    const body = schema.parse(req.body);
    const session = await requireLeadSession(body.token);
    const { graph, locked, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    const node = graph.nodes.find((n) => n.id === body.nodeId);
    if (!node || node.type !== "ai") throw new HttpError(404, "Bloco não encontrado");
    if (locked.has(node.id) && !unlocked.has(node.id)) throw new HttpError(403, "Conteúdo bloqueado");
    const content = node.content as AiContent;
    const brain = content.brainId ? await prisma.brain.findUnique({ where: { id: content.brainId } }) : null;
    if (!brain || !brain.active) throw new HttpError(404, "Cérebro indisponível");

    const where = { conversationId: session.conversationId, nodeId: node.id, type: "ai_reply" };
    const replies = await prisma.event.count({ where });
    if (body.start && replies > 0) return { messages: [], offer: null, audio: null, end: false };
    if (replies >= brain.maxReplies) return { messages: [], offer: null, audio: null, end: true, limit: true };

    const text = sanitizeText(body.message, 1000);
    if (!body.start && !body.event && !text) throw new HttpError(400, "Mensagem vazia");
    if (body.event === "call_declined") {
      await addConversationMessage(session.conversationId, "user", "call_declined", { text: "Recusou a chamada de vídeo" }, node.id);
    }
    if (text) {
      await addConversationMessage(session.conversationId, "user", "text", { text }, node.id);
      await trackEvent({ leadId: session.leadId, funnelId: session.funnelId, conversationId: session.conversationId, type: "ai_message", nodeId: node.id, data: { value: text } });
    }
    await prisma.conversation.update({ where: { id: session.conversationId }, data: { currentNodeId: node.id } });

    const [history, lead, paid] = await Promise.all([
      prisma.message.findMany({ where: { conversationId: session.conversationId }, orderBy: { createdAt: "asc" }, take: 200 }),
      prisma.lead.findUnique({ where: { id: session.leadId }, select: { name: true, variables: true } }),
      prisma.payment.findMany({ where: { leadId: session.leadId, status: "APPROVED" }, include: { product: { select: { name: true } } } }),
    ]);
    const vars = (lead?.variables ?? {}) as Record<string, string>;
    const context = [
      lead?.name || vars.name ? `Nome: ${lead?.name || vars.name}` : "",
      Object.keys(vars).length ? `Respostas anteriores: ${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("; ")}` : "",
      paid.length ? `Já comprou: ${paid.map((p) => p.product.name).join(", ")} (não ofereça de novo o que já comprou; agradeça e siga o objetivo)` : "Ainda não comprou nada.",
    ]
      .filter(Boolean)
      .join("\n");

    let reply;
    try {
      reply = await runBrain({ brain, history: toTurns(history.slice(-60)), goal: content.goal, context });
    } catch (e) {
      console.error("[ai]", e);
      const msg = brain.fallbackMessage || "Hmm, me perdi aqui 😅 pode repetir?";
      await addConversationMessage(session.conversationId, "bot", "text", { text: msg }, node.id);
      return { messages: [msg], offer: null, audio: null, end: false, error: describeAiError(e) };
    }

    for (const m of reply.messages) await addConversationMessage(session.conversationId, "bot", "text", { text: m }, node.id);
    if (reply.audio) {
      await addConversationMessage(session.conversationId, "bot", "audio", { url: reply.audio.url, caption: "", aiAudioId: reply.audio.id }, node.id);
    }
    let offer = null;
    if (reply.offer) {
      const p = reply.offer.product;
      offer = {
        productId: p.id,
        headline: reply.offer.headline || p.name,
        ctaLabel: reply.offer.ctaLabel || undefined,
        description: undefined as string | undefined,
        style: reply.offer.style === "call" && reply.offer.videoId ? ("call" as const) : ("card" as const),
      };
      await addConversationMessage(
        session.conversationId,
        "bot",
        "offer",
        { productId: p.id, name: p.name, headline: offer.headline, ctaLabel: offer.ctaLabel ?? null, price: p.price, originalPrice: p.originalPrice, aiOfferId: reply.offer.id, style: offer.style } as Prisma.InputJsonValue,
        node.id,
      );
      await trackEvent({ leadId: session.leadId, funnelId: session.funnelId, conversationId: session.conversationId, type: "offer_viewed", nodeId: node.id, data: { productId: p.id, ai: true } });
    }
    await trackEvent({
      leadId: session.leadId,
      funnelId: session.funnelId,
      conversationId: session.conversationId,
      type: "ai_reply",
      nodeId: node.id,
      data: { offerId: reply.offer?.id ?? null, audioId: reply.audio?.id ?? null, end: reply.end, usage: reply.usage ?? null } as Prisma.InputJsonValue,
    });
    return {
      messages: reply.messages,
      audio: reply.audio ? { url: reply.audio.url } : null,
      offer,
      end: reply.end,
    };
  },
});
