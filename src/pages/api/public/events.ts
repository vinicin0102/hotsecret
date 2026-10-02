// Recebe eventos do chat público. O conteúdo das mensagens do personagem é sempre lido do
// banco (nó do fluxo), nunca confiado ao navegador. Respostas do visitante são sanitizadas.
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiHandler, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";
import { trackEvent } from "@/services/tracking";
import { addTagToLead } from "@/services/tags";
import { addConversationMessage } from "@/services/payments/service";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";
import type { ChoiceButton } from "@/types/flow";

const CLIENT_EVENTS = [
  "chat_started",
  "node_entered",
  "message_viewed",
  "button_clicked",
  "question_answered",
  "image_viewed",
  "video_started",
  "audio_played",
  "offer_viewed",
  "offer_clicked",
  "checkout_started",
  "delivery_viewed",
  "link_clicked",
  "chat_completed",
] as const;

const schema = z.object({
  token: z.string().min(10).max(2000),
  events: z
    .array(
      z.object({
        type: z.enum(CLIENT_EVENTS),
        nodeId: z.string().max(64).optional().nullable(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(20),
});

const MEDIA_MESSAGE: Record<string, string> = { image: "image", video: "video", audio: "audio" };

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "events", 300, 60_000);
    const body = schema.parse(req.body);
    const session = await requireLeadSession(body.token);
    const { leadId, conversationId, funnelId } = session;

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.leadId !== leadId) return { ok: false };

    const nodeIds = [...new Set(body.events.map((e) => e.nodeId).filter((v): v is string => !!v))];
    const nodes = await prisma.funnelNode.findMany({ where: { funnelId, id: { in: nodeIds } } });
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // conteúdo pago: só registra nós liberados por pagamento aprovado
    const access = await entitledNodes(funnelId, leadId);

    for (const ev of body.events) {
      const node = ev.nodeId ? nodeMap.get(ev.nodeId) : undefined;
      if (ev.nodeId && !node) continue; // nó inexistente: ignora
      if (node && access.locked.has(node.id) && !access.unlocked.has(node.id)) continue;
      const content = (node?.content ?? {}) as Record<string, unknown>;
      const data: Record<string, Prisma.InputJsonValue> = {};

      switch (ev.type) {
        case "node_entered": {
          if (!node) continue;
          await prisma.conversation.update({ where: { id: conversationId }, data: { currentNodeId: node.id } });
          if (node.type === "tag" && typeof content.tagId === "string") {
            const tag = await prisma.tag.findUnique({ where: { id: content.tagId } });
            if (tag) await addTagToLead(leadId, tag.id, "flow");
          }
          if (node.type === "end") {
            await prisma.conversation.update({ where: { id: conversationId }, data: { status: "completed", endedAt: new Date() } });
          }
          data.nodeType = node.type;
          break;
        }
        case "message_viewed": {
          if (!node) continue;
          if (node.type === "text") {
            const sender = content.sender === "user" ? "user" : "bot";
            await addConversationMessage(conversationId, sender, "text", { text: String(content.text ?? "") }, node.id);
          } else if (MEDIA_MESSAGE[node.type]) {
            await addConversationMessage(conversationId, "bot", MEDIA_MESSAGE[node.type], content as Prisma.InputJsonValue, node.id);
          } else if (node.type === "buttons" || node.type === "question") {
            await addConversationMessage(conversationId, "bot", node.type === "question" && content.mode === "open" ? "text" : "buttons", {
              text: String(content.text ?? ""),
              buttons: ((content.buttons as ChoiceButton[] | undefined) ?? []).map((b) => b.label),
            }, node.id);
          } else if (node.type === "delivery" || node.type === "link") {
            // registrado com o tipo próprio para o botão reaparecer ao retomar a conversa
            await addConversationMessage(conversationId, "bot", node.type, {
              text: String(content.text ?? ""),
              buttonLabel: String(content.buttonLabel ?? ""),
            }, node.id);
          } else if (node.type === "end") {
            if (content.text) await addConversationMessage(conversationId, "bot", "text", { text: String(content.text) }, node.id);
          }
          data.nodeType = node.type;
          break;
        }
        case "button_clicked": {
          if (!node) continue;
          const buttons = (content.buttons as ChoiceButton[] | undefined) ?? [];
          const btn = buttons.find((b) => b.id === ev.data?.buttonId);
          if (!btn) continue;
          // resposta digitada pelo lead (ou o rótulo, quando ele clicou)
          const typed = sanitizeText(ev.data?.value, 1000);
          await addConversationMessage(conversationId, "user", "text", { text: typed || btn.label }, node.id);
          data.buttonId = btn.id;
          data.label = btn.label;
          if (typed) data.value = typed;
          break;
        }
        case "question_answered": {
          if (!node) continue;
          const value = sanitizeText(ev.data?.value, 1000);
          if (!value) continue;
          await addConversationMessage(conversationId, "user", "text", { text: value }, node.id);
          const variable = typeof content.variable === "string" ? content.variable : "";
          const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { variables: true } });
          const vars = { ...((lead?.variables as Record<string, string>) ?? {}) };
          if (variable) vars[variable] = value;
          await prisma.lead.update({
            where: { id: leadId },
            data: {
              variables: vars,
              ...(variable === "name" ? { name: value.slice(0, 120) } : {}),
              ...(variable === "email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? { email: value.toLowerCase().slice(0, 160) } : {}),
              ...(variable === "phone" ? { phone: value.replace(/[^\d+]/g, "").slice(0, 20) } : {}),
            },
          });
          data.variable = variable;
          data.value = value;
          break;
        }
        case "offer_viewed": {
          if (!node || node.type !== "offer") continue;
          const product = await prisma.product.findUnique({ where: { id: String(content.productId ?? "") } });
          if (!product) continue;
          await addConversationMessage(conversationId, "bot", "offer", {
            productId: product.id,
            name: product.name,
            headline: (content.headline as string) || product.name,
            price: product.price,
            originalPrice: product.originalPrice,
          }, node.id);
          data.productId = product.id;
          break;
        }
        case "checkout_started": {
          if (!node || node.type !== "offer") continue;
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { checkoutStartedAt: conversation.checkoutStartedAt ?? new Date(), checkoutNodeId: node.id },
          });
          data.productId = String(content.productId ?? "");
          break;
        }
        case "link_clicked":
          data.url = String(content.url ?? "");
          break;
        case "chat_completed":
          await prisma.conversation.update({ where: { id: conversationId }, data: { status: "completed", endedAt: new Date() } });
          break;
        default:
          break;
      }

      if (ev.type === "video_started" || ev.type === "audio_played" || ev.type === "image_viewed") {
        data.url = String(content.url ?? "");
      }

      await trackEvent({ leadId, funnelId, conversationId, type: ev.type, nodeId: node?.id ?? null, data });
    }
    return { ok: true };
  },
});
