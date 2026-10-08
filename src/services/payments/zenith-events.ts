// Partes puras do webhook da Zenith (sem banco): assinatura, leitura do evento e consumidor idempotente.
import type { PaymentStatus } from "@prisma/client";
import type { WebhookRequest } from "./types";
import { mapZenithStatus } from "./zenith";

export interface ZenithWebhookEvent {
  id: string;
  type: string;
  referenceId: string;
  amount: number;
  currency: string;
  status: string;
  checkoutId: string | null;
}

/**
 * Valida a assinatura do webhook (corpo bruto + timestamp + HMAC).
 * PENDENTE: o esquema de assinatura (cabeçalhos, texto assinado e segredo) ainda não foi confirmado
 * na documentação oficial — até lá TODO webhook é recusado (fail-closed) e nenhum pagamento é aprovado.
 */
export function verifyZenithSignature(_req: WebhookRequest, _nowMs = Date.now()): { ok: true } | { ok: false; reason: string } {
  return { ok: false, reason: "signature_scheme_pending" };
}

const str = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);

/** Lê o evento do corpo já autenticado. null = corpo sem os campos obrigatórios. */
export function parseZenithEvent(rawBody: string): ZenithWebhookEvent | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object") return null;
  const data = (body.data && typeof body.data === "object" ? body.data : body) as Record<string, unknown>;
  const checkout = (data.checkout && typeof data.checkout === "object" ? data.checkout : data) as Record<string, unknown>;
  const payment = (data.payment && typeof data.payment === "object" ? data.payment : {}) as Record<string, unknown>;
  const id = str(body.id) ?? str(body.eventId);
  const referenceId = str(checkout.referenceId);
  const amount = typeof checkout.amount === "number" ? checkout.amount : Number.NaN;
  const currency = str(checkout.currency);
  const status = str(payment.status) ?? str(checkout.status);
  if (!id || !referenceId || !Number.isInteger(amount) || !currency || !status) return null;
  return { id, type: str(body.type) ?? "", referenceId, amount, currency, status, checkoutId: str(checkout.id) ?? null };
}

/** Acesso ao banco usado pelo consumidor (separado para os testes). */
export interface ZenithWebhookStore {
  findPayment(id: string): Promise<{ id: string; provider: string; amount: number; currency: string; providerPaymentId: string | null } | null>;
  /** registra o id do evento; false = já processado */
  markProcessed(eventId: string, paymentId: string): Promise<boolean>;
  unmark(eventId: string): Promise<void>;
  apply(paymentId: string, status: PaymentStatus): Promise<void>;
}

export type ZenithConsumeResult =
  | "applied"
  | "duplicate"
  | "unknown_payment"
  | "amount_mismatch"
  | "currency_mismatch"
  | "checkout_mismatch"
  | "pending_ignored";

/** Consumidor idempotente: o mesmo evento nunca é aplicado duas vezes. */
export async function consumeZenithEvent(event: ZenithWebhookEvent, store: ZenithWebhookStore): Promise<ZenithConsumeResult> {
  const payment = await store.findPayment(event.referenceId);
  if (!payment || payment.provider !== "zenith") return "unknown_payment";
  if (payment.amount !== event.amount) return "amount_mismatch";
  if (payment.currency !== event.currency) return "currency_mismatch";
  if (payment.providerPaymentId && event.checkoutId && payment.providerPaymentId !== event.checkoutId) return "checkout_mismatch";
  const status = mapZenithStatus(event.status);
  if (status === "PENDING") return "pending_ignored";
  if (!(await store.markProcessed(event.id, payment.id))) return "duplicate";
  try {
    await store.apply(payment.id, status);
  } catch (e) {
    // falhou ao aplicar: libera o id para a Zenith reenviar
    await store.unmark(event.id);
    throw e;
  }
  return "applied";
}

