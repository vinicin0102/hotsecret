// Recuperação de checkout:
// SE checkout iniciado E pagamento não aprovado → após N minutos → mensagem automática no chat.
import { prisma } from "@/lib/prisma";
import { getFunnelSettings } from "./funnels";
import { addConversationMessage } from "./payments/service";
import { trackEvent } from "./tracking";
import { ensureTag, addTagToLead } from "./tags";

async function recoverConversation(conversationId: string): Promise<boolean> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { funnel: { select: { settings: true } } },
  });
  if (!conv || !conv.checkoutStartedAt || conv.recoverySentAt || !conv.funnel) return false;
  const { recovery } = getFunnelSettings(conv.funnel.settings);
  if (!recovery.enabled) return false;
  if (Date.now() - conv.checkoutStartedAt.getTime() < recovery.delayMinutes * 60 * 1000) return false;

  const approved = await prisma.payment.count({ where: { conversationId, status: "APPROVED" } });
  if (approved > 0) return false;

  // marca antes de enviar (condicional) para nunca duplicar a mensagem
  const { count } = await prisma.conversation.updateMany({
    where: { id: conversationId, recoverySentAt: null },
    data: { recoverySentAt: new Date() },
  });
  if (count === 0) return false;

  await addConversationMessage(conversationId, "bot", "recovery", {
    text: recovery.message,
    buttonLabel: recovery.buttonLabel,
    offerNodeId: conv.checkoutNodeId,
  }, conv.checkoutNodeId);
  await trackEvent({
    leadId: conv.leadId,
    funnelId: conv.funnelId,
    conversationId,
    type: "checkout_recovery_sent",
    nodeId: conv.checkoutNodeId,
  });
  const tag = await ensureTag("ABANDONO", "#C92F56");
  await addTagToLead(conv.leadId, tag.id, "automation");
  return true;
}

/** Verificação pontual (chamada enquanto o visitante está com o chat aberto). */
export async function checkRecoveryFor(conversationId: string) {
  return recoverConversation(conversationId).catch((e) => {
    console.error("[recovery]", e);
    return false;
  });
}

/** Varredura periódica (cron). */
export async function processDueRecoveries(limit = 200) {
  const candidates = await prisma.conversation.findMany({
    where: {
      checkoutStartedAt: { not: null, lte: new Date(Date.now() - 60 * 1000) },
      recoverySentAt: null,
      payments: { none: { status: "APPROVED" } },
    },
    select: { id: true },
    take: limit,
    orderBy: { checkoutStartedAt: "asc" },
  });
  let sent = 0;
  for (const c of candidates) if (await checkRecoveryFor(c.id)) sent++;
  return { checked: candidates.length, sent };
}
