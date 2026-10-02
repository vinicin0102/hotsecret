// Registro de eventos do funil + transições de etapa do lead + automações.
import type { LeadStage, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addTagToLead, removeTagFromLead } from "./tags";

export const EVENT_TYPES = [
  "page_view",
  "chat_started",
  "message_viewed",
  "button_clicked",
  "question_answered",
  "image_viewed",
  "video_started",
  "audio_played",
  "offer_viewed",
  "offer_clicked",
  "checkout_started",
  "payment_pending",
  "payment_approved",
  "payment_failed",
  "payment_refunded",
  "checkout_recovery_sent",
  "delivery_viewed",
  "link_clicked",
  "chat_completed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const STAGE_ORDER: LeadStage[] = ["NEW", "INTERESTED", "CHECKOUT", "ABANDONED", "BUYER"];

/** Etapa resultante de um evento (nunca regride um comprador). */
function stageForEvent(type: string, current: LeadStage): LeadStage | null {
  if (current === "BUYER") return type === "payment_refunded" ? "ABANDONED" : null;
  switch (type) {
    case "button_clicked":
    case "question_answered":
    case "offer_viewed":
    case "offer_clicked":
      return current === "NEW" ? "INTERESTED" : null;
    case "checkout_started":
    case "payment_pending":
      return "CHECKOUT";
    case "payment_failed":
    case "checkout_recovery_sent":
      return STAGE_ORDER.indexOf(current) <= STAGE_ORDER.indexOf("CHECKOUT") ? "ABANDONED" : null;
    case "payment_approved":
      return "BUYER";
    default:
      return null;
  }
}

export interface TrackInput {
  leadId: string;
  funnelId?: string | null;
  conversationId?: string | null;
  type: EventType | string;
  nodeId?: string | null;
  data?: Prisma.InputJsonValue;
}

export async function trackEvent(input: TrackInput) {
  const event = await prisma.event.create({
    data: {
      leadId: input.leadId,
      funnelId: input.funnelId ?? null,
      conversationId: input.conversationId ?? null,
      type: input.type,
      nodeId: input.nodeId ?? null,
      data: input.data ?? {},
    },
  });

  const lead = await prisma.lead.findUnique({ where: { id: input.leadId }, select: { stage: true } });
  if (lead) {
    const next = stageForEvent(input.type, lead.stage);
    await prisma.lead.update({
      where: { id: input.leadId },
      data: {
        lastInteractionAt: new Date(),
        ...(next && next !== lead.stage ? { stage: next } : {}),
        ...(input.nodeId ? { currentNodeId: input.nodeId } : {}),
      },
    });
  }

  await runAutomations(input).catch((e) => console.error("[automations]", e));
  return event;
}

/** Automações configuradas no painel: QUANDO <evento> [no fluxo X] → adicionar/remover tag. */
async function runAutomations(input: TrackInput) {
  const rules = await prisma.automation.findMany({
    where: {
      active: true,
      trigger: input.type,
      OR: [{ funnelId: null }, { funnelId: input.funnelId ?? undefined }],
    },
  });
  for (const rule of rules) {
    if (!rule.tagId) continue;
    if (rule.action === "add_tag") await addTagToLead(input.leadId, rule.tagId, "automation");
    if (rule.action === "remove_tag") await removeTagFromLead(input.leadId, rule.tagId);
  }
}
