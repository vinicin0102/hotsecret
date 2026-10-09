// Bloco Cérebro: a IA responde o lead. A chave da API fica só no servidor; preços e ofertas vêm do banco.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes, getFunnelSettings } from "@/services/funnels";
import { addConversationMessage } from "@/services/payments/service";
import { trackEvent } from "@/services/tracking";
import { describeAiError, publicOfferFormat, runBrain, type ChatTurn, type FlowOfferInfo } from "@/services/ai/brain";
import { AI_OFFERS_OUT, flowOffersFrom } from "@/features/chat-engine/engine";
import { formatBRL, formatMoney } from "@/lib/format";

/** preço do histórico na moeda certa (a IA nunca deve ver R$ numa oferta em pesos) */
const priceForAi = (cents: number, currency: unknown) =>
  currency === "MXN" ? `${formatMoney(cents, "MXN", "es-MX")} MXN` : currency === "ARS" ? `${formatMoney(cents, "ARS", "es-AR")} ARS` : formatBRL(cents);
import type { AiContent } from "@/types/flow";

export const config = { maxDuration: 60 };

const schema = z.object({
  token: z.string().min(10).max(2000),
  nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/),
  message: z.string().max(2000).optional(),
  /** a IA puxa a conversa (bloco com "A IA puxa a conversa") */
  start: z.boolean().optional(),
  /** algo que o lead fez no chat (ex.: recusou a chamada de vídeo) */
  /** call_declined: recusou a chamada · photo: o lead acabou de mandar uma foto (já gravada por /api/public/photo) */
  /** continue: o lead voltou para a IA depois dos botões de oferta (a resposta dele já está gravada) */
  event: z.enum(["call_declined", "photo", "continue", "voice_declined"]).optional(),
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
        if (m.sender === "user") {
          // foto enviada pelo lead: a IA vê a imagem (as mais recentes)
          if (m.type === "image" && typeof c.url === "string") turns.push({ role: "lead", text: "[enviou uma foto]", imageUrl: c.url });
          break;
        }
        turns.push({
          role: "bot",
          text: `[enviou ${m.type === "image" ? "uma foto" : "um vídeo"}${c.caption ? `: ${String(c.caption)}` : ""}${c.aiImageId ? ` (image_id "${String(c.aiImageId)}")` : ""}]`,
        });
        break;
      case "audio":
        turns.push({ role: "bot", text: `[enviou um áudio${c.aiAudioId ? ` (audio_id "${String(c.aiAudioId)}")` : ""}]` });
        break;
      case "offer":
        turns.push({
          role: "bot",
          text: `[${c.style === "call" ? "ligou para o lead (chamada de vídeo) com a oferta" : c.style === "tarot" ? "mostrou as cartas de tarot viradas da oferta" : c.style === "live" ? "abriu o upgrade do canal VIP ao vivo com a oferta" : "mostrou o card da oferta"} ${String(c.headline || c.name || "")} — ${typeof c.price === "number" ? priceForAi(c.price, c.currency) : ""}${c.aiOfferId ? ` (offer_id "${String(c.aiOfferId)}")` : ""}]`,
        });
        break;
      case "checkout":
        turns.push({ role: "lead", text: "[tocou no botão para comprar e gerou o pagamento]" });
        break;
      case "call_declined":
        turns.push({ role: "lead", text: "[recusou a chamada de vídeo]" });
        break;
      case "voice_call":
        if (c.status === "ringing") turns.push({ role: "bot", text: "[ligou para o lead (ligação de voz)]" });
        else if (c.status === "declined") turns.push({ role: "lead", text: "[recusou a ligação de voz]" });
        else if (c.status === "ended") turns.push({ role: "lead", text: `[atendeu a ligação de voz e ouviu ${Number(c.seconds) || 0}s da sua fala]` });
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
    if (body.start && replies > 0) return { messages: [], offer: null, audio: null, image: null, end: false };
    if (replies >= brain.maxReplies) return { messages: [], offer: null, audio: null, image: null, end: true, limit: true };

    const text = sanitizeText(body.message, 1000);
    if (!body.start && !body.event && !text) throw new HttpError(400, "Mensagem vazia");
    if (body.event === "voice_declined") {
      await addConversationMessage(session.conversationId, "user", "voice_call", { status: "declined", text: "Recusou a ligação de voz" }, node.id);
    }
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

    // saída "Mostrar botões de oferta": a IA explica os produtos ligados nela e decide quando soltar os botões
    let flowOffers: FlowOfferInfo[] | undefined;
    if (graph.edges.some((e) => e.source === node.id && e.condition === AI_OFFERS_OUT)) {
      const list = flowOffersFrom(graph, node.id);
      const prods = await prisma.product.findMany({ where: { id: { in: list.map((o) => o.productId) }, active: true } });
      flowOffers = list
        .map((o): FlowOfferInfo | null => {
          const p = prods.find((x) => x.id === o.productId);
          return p ? { name: o.headline || p.name, price: p.price, originalPrice: p.originalPrice, currency: p.currency, description: p.description, button: o.button } : null;
        })
        .filter((v): v is FlowOfferInfo => !!v);
    }

    let reply;
    try {
      const funnelRow = await prisma.funnel.findUnique({ where: { id: session.funnelId }, select: { settings: true } });
      const language = getFunnelSettings(funnelRow?.settings).locale;
      reply = await runBrain({ brain, history: toTurns(history.slice(-60)), goal: content.goal, context, flowOffers, language });
    } catch (e) {
      console.error("[ai]", e);
      const lang = await prisma.funnel
        .findUnique({ where: { id: session.funnelId }, select: { settings: true } })
        .then((f) => getFunnelSettings(f?.settings).locale)
        .catch(() => "pt-BR");
      const msg = brain.fallbackMessage || (lang === "pt-BR" ? "Hmm, me perdi aqui 😅 pode repetir?" : "Mmm, me perdí 😅 ¿me lo repites?");
      await addConversationMessage(session.conversationId, "bot", "text", { text: msg }, node.id);
      // o motivo aparece no painel (Cérebro → Conexão com a IA)
      await trackEvent({ leadId: session.leadId, funnelId: session.funnelId, conversationId: session.conversationId, type: "ai_error", nodeId: node.id, data: { error: describeAiError(e), brain: brain.name } });
      return { messages: [msg], offer: null, audio: null, image: null, end: false, error: describeAiError(e) };
    }
    if (reply.failure) {
      await trackEvent({ leadId: session.leadId, funnelId: session.funnelId, conversationId: session.conversationId, type: "ai_error", nodeId: node.id, data: { error: reply.failure, brain: brain.name } });
    }

    for (const m of reply.messages) await addConversationMessage(session.conversationId, "bot", "text", { text: m }, node.id);
    if (reply.image) {
      const kind = reply.image.kind === "video" ? "video" : "image";
      await addConversationMessage(session.conversationId, "bot", kind, { url: reply.image.url, caption: "", aiImageId: reply.image.id }, node.id);
    }
    if (reply.voiceCall) {
      await addConversationMessage(session.conversationId, "bot", "voice_call", { status: "ringing", callId: reply.voiceCall.id, text: "Ligação de voz" }, node.id);
    }
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
        ...publicOfferFormat(reply.offer),
        downsellProductId: reply.offer.downsellProductId || undefined,
        downsellText: reply.offer.downsellText || undefined,
      };
      await addConversationMessage(
        session.conversationId,
        "bot",
        "offer",
        {
          productId: p.id,
          name: p.name,
          headline: offer.headline,
          ctaLabel: offer.ctaLabel ?? null,
          price: p.price,
          originalPrice: p.originalPrice,
          currency: p.currency,
          aiOfferId: reply.offer.id,
          style: offer.style,
          tarotCards: offer.tarotCards ?? null,
          tarotBackUrl: offer.tarotBackUrl ?? null,
          ...(offer.freeLoop ? { freeLoop: true } : {}),
          // canal VIP: os textos e o 2º ingresso voltam quando o lead recarrega a página
          ...(offer.style === "live"
            ? { vip: (offer.vip ?? {}) as Prisma.InputJsonValue, downsellProductId: offer.downsellProductId ?? null, hasVideo: !!offer.hasVideo }
            : {}),
        } as Prisma.InputJsonValue,
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
      data: { offerId: reply.offer?.id ?? null, audioId: reply.audio?.id ?? null, imageId: reply.image?.id ?? null, end: reply.end, usage: reply.usage ?? null } as Prisma.InputJsonValue,
    });
    return {
      messages: reply.messages,
      audio: reply.audio ? { url: reply.audio.url } : null,
      image: reply.image ? { url: reply.image.url, kind: reply.image.kind === "video" ? "video" : "image" } : null,
      offer,
      end: reply.end,
      showOffers: !!reply.showOffers,
      voiceCall: reply.voiceCall ? { id: reply.voiceCall.id, url: reply.voiceCall.url } : null,
    };
  },
});
