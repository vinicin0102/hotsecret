// Webhook da Zenith: a ÚNICA fonte de confirmação de pagamento.
// Ordem: corpo bruto → timestamp (±300s) → HMAC (ZENITH_WEBHOOK_SECRET) → referenceId/amount/currency →
// id único do evento (idempotente) → status. Falha ao aplicar = 500 (a Zenith reenvia).
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { applyPaymentStatus } from "./service";
import type { WebhookRequest } from "./types";
import { consumeZenithEvent, parseZenithEvent, verifyZenithSignature, type ZenithWebhookStore } from "./zenith-events";

export const prismaZenithStore: ZenithWebhookStore = {
  findPayment: (id) =>
    prisma.payment.findUnique({ where: { id }, select: { id: true, provider: true, amount: true, currency: true, providerPaymentId: true } }),
  async markProcessed(eventId, paymentId) {
    try {
      await prisma.webhookEvent.create({ data: { provider: "zenith", eventId, paymentId } });
      return true;
    } catch (e) {
      if ((e as { code?: string })?.code === "P2002") return false;
      throw e;
    }
  },
  async unmark(eventId) {
    await prisma.webhookEvent.deleteMany({ where: { provider: "zenith", eventId } });
  },
  async apply(paymentId, status) {
    await applyPaymentStatus(paymentId, status, "webhook");
  },
};

export async function handleZenithWebhook(req: WebhookRequest, store: ZenithWebhookStore = prismaZenithStore): Promise<{ status: number; body: Record<string, unknown> }> {
  const sig = verifyZenithSignature(req);
  let payload: Prisma.InputJsonValue;
  try {
    payload = JSON.parse(req.rawBody || "{}");
  } catch {
    payload = { raw: req.rawBody.slice(0, 2000) };
  }
  const event = sig.ok ? parseZenithEvent(req.rawBody) : null;
  const log = await prisma.webhookLog.create({
    data: { provider: "zenith", eventType: event?.type || null, signatureValid: sig.ok, payload },
  });
  if (!sig.ok) {
    console.warn("[zenith] webhook recusado:", sig.reason);
    return { status: 401, body: { error: "assinatura inválida" } };
  }
  if (!event) return { status: 400, body: { error: "evento inválido" } };

  const result = await consumeZenithEvent(event, store);
  if (result !== "unknown_payment") {
    await prisma.webhookLog.update({ where: { id: log.id }, data: { paymentId: event.referenceId } }).catch(() => undefined);
  }
  // evento autêntico que não bate com o pedido: nada é aprovado e fica registrado para conferência
  if (result.endsWith("_mismatch") || result.endsWith("_missing")) console.warn("[zenith] webhook ignorado:", result, event.id, event.type);
  return { status: 200, body: { ok: true, result } };
}
