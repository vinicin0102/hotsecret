import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProvider } from "./index";
import { applyPaymentStatus } from "./service";
import type { WebhookRequest } from "./types";
import { handleZenithWebhook } from "./zenith-webhook";

export interface WebhookOutcome {
  status: number;
  body: Record<string, unknown>;
}

/** Processa um webhook de pagamento: valida assinatura, consulta o gateway e aplica o status. */
export async function handlePaymentWebhook(providerName: string, req: WebhookRequest): Promise<WebhookOutcome> {
  // Zenith: o webhook assinado é a fonte da verdade (não há consulta ativa)
  if (providerName === "zenith") return handleZenithWebhook(req);
  let provider;
  try {
    provider = getProvider(providerName);
  } catch {
    return { status: 404, body: { error: "provider" } };
  }

  const verification = provider.verifyWebhook(req);
  let payload: Prisma.InputJsonValue = {};
  try {
    payload = JSON.parse(req.rawBody || "{}");
  } catch {
    payload = { raw: req.rawBody.slice(0, 2000) };
  }

  const log = await prisma.webhookLog.create({
    data: { provider: provider.name, eventType: verification.eventType ?? null, signatureValid: verification.valid, payload },
  });

  if (!verification.valid) return { status: 401, body: { error: "assinatura inválida" } };
  if (!verification.providerPaymentId) return { status: 200, body: { ignored: true } };

  // Fonte da verdade: status consultado diretamente no gateway (exceto sandbox, assinado por HMAC).
  let status = verification.status;
  let externalReference = verification.externalReference ?? null;
  if (provider.name !== "sandbox") {
    if (verification.eventType && !String(verification.eventType).startsWith("payment")) {
      return { status: 200, body: { ignored: verification.eventType } };
    }
    const info = await provider.fetchPayment(verification.providerPaymentId);
    if (!info) return { status: 200, body: { ignored: "not_found" } };
    status = info.status;
    externalReference = info.externalReference;
  }

  let payment = await prisma.payment.findUnique({
    where: { provider_providerPaymentId: { provider: provider.name, providerPaymentId: verification.providerPaymentId } },
  });
  // a referência externa do webhook também serve (cobranças cujo id do gateway chegou depois)
  if (verification.signed) externalReference = externalReference ?? verification.externalReference ?? null;
  if (!payment && externalReference) {
    payment = await prisma.payment.findUnique({ where: { id: externalReference } });
    // Checkout Pro: o id do pagamento só é conhecido aqui.
    if (payment && payment.provider === provider.name && !payment.providerPaymentId) {
      payment = await prisma.payment.update({
        where: { id: payment.id },
        data: { providerPaymentId: verification.providerPaymentId },
      });
    }
  }
  if (!payment || payment.provider !== provider.name) return { status: 200, body: { ignored: "unknown_payment" } };
  // a transação confirmada precisa ser exatamente a deste pedido
  if (payment.providerPaymentId && payment.providerPaymentId !== verification.providerPaymentId) {
    return { status: 200, body: { ignored: "transaction_mismatch" } };
  }

  await prisma.webhookLog.update({ where: { id: log.id }, data: { paymentId: payment.id } });
  if (status) await applyPaymentStatus(payment.id, status, "webhook");
  return { status: 200, body: { ok: true } };
}
