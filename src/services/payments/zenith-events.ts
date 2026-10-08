// Partes puras do webhook da Zenith (sem banco): assinatura, leitura do evento e consumidor idempotente.
import { createHmac } from "node:crypto";
import type { PaymentStatus } from "@prisma/client";
import { header, safeEqualHex } from "./crypto";
import type { WebhookRequest } from "./types";
import { mapZenithStatus } from "./zenith";

export interface ZenithWebhookEvent {
  /** id único do evento (consumidor idempotente) */
  id: string;
  /** ex.: payment.captured */
  type: string;
  referenceId: string;
  amount: number | null;
  currency: string | null;
  /** status interno que o evento representa */
  status: "PENDING" | "APPROVED" | "FAILED" | "REFUNDED";
  checkoutId: string | null;
}

/** Tolerância do timestamp do webhook (segundos), como na documentação da Zenith. */
export const ZENITH_WEBHOOK_TOLERANCE_S = 300;

/**
 * Assinatura do webhook (documentação oficial da Zenith):
 * X-Zenith-Timestamp (segundos) e X-Zenith-Signature = hex(HMAC-SHA256(ZENITH_WEBHOOK_SECRET, "<timestamp>." + corpo bruto)).
 * Sem segredo configurado, todo webhook é recusado.
 */
export function verifyZenithSignature(
  req: WebhookRequest,
  secret: string | undefined = process.env.ZENITH_WEBHOOK_SECRET,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "ZENITH_WEBHOOK_SECRET não configurado" };
  const timestamp = header(req.headers, "x-zenith-timestamp");
  const received = header(req.headers, "x-zenith-signature");
  if (!timestamp || !received) return { ok: false, reason: "cabeçalhos de assinatura ausentes" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "timestamp inválido" };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > ZENITH_WEBHOOK_TOLERANCE_S) return { ok: false, reason: "timestamp fora da janela" };
  if (!/^[0-9a-f]+$/i.test(received)) return { ok: false, reason: "assinatura inválida" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(req.rawBody, "utf8").digest("hex");
  if (!safeEqualHex(expected, received.toLowerCase())) return { ok: false, reason: "assinatura inválida" };
  return { ok: true };
}

const str = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** Tipo do evento → status interno (payment.captured = pago). */
export function zenithEventStatus(type: string, fallbackStatus?: string): ZenithWebhookEvent["status"] {
  const t = type.toLowerCase();
  if (/(captured|paid|succeeded|approved|completed)$/.test(t)) return "APPROVED";
  if (/(refunded|chargeback|charged_back)$/.test(t)) return "REFUNDED";
  if (/(failed|declined|rejected|expired|canceled|cancelled)$/.test(t)) return "FAILED";
  return mapZenithStatus(fallbackStatus);
}

/** Lê o evento do corpo já autenticado. null = sem id, tipo ou referenceId. */
export function parseZenithEvent(rawBody: string): ZenithWebhookEvent | null {
  let body: Record<string, unknown> | undefined;
  try {
    body = obj(JSON.parse(rawBody));
  } catch {
    return null;
  }
  if (!body) return null;
  const data = obj(body.data) ?? {};
  const checkout = obj(data.checkout) ?? {};
  const payment = obj(data.payment) ?? {};
  const pick = (k: string) => data[k] ?? checkout[k] ?? payment[k];
  const id = str(body.id);
  const type = str(body.type) ?? "";
  const referenceId = str(pick("referenceId"));
  if (!id || !type || !referenceId) return null;
  const amount = pick("amount");
  return {
    id,
    type,
    referenceId,
    amount: typeof amount === "number" && Number.isInteger(amount) ? amount : null,
    currency: str(pick("currency"))?.toUpperCase() ?? null,
    status: zenithEventStatus(type, str(payment.status) ?? str(data.status) ?? str(checkout.status)),
    checkoutId: str(data.checkoutId) ?? str(checkout.id) ?? null,
  };
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
  | "amount_missing"
  | "amount_mismatch"
  | "currency_missing"
  | "currency_mismatch"
  | "checkout_mismatch"
  | "pending_ignored";

/** Consumidor idempotente: o mesmo evento nunca é aplicado duas vezes. */
export async function consumeZenithEvent(event: ZenithWebhookEvent, store: ZenithWebhookStore): Promise<ZenithConsumeResult> {
  const payment = await store.findPayment(event.referenceId);
  if (!payment || payment.provider !== "zenith") return "unknown_payment";
  const status = event.status;
  if (status === "PENDING") return "pending_ignored";
  // valor e moeda precisam vir no evento e bater com o pedido (nada é aprovado sem conferir)
  if (event.amount === null) return "amount_missing";
  if (payment.amount !== event.amount) return "amount_mismatch";
  if (!event.currency) return "currency_missing";
  if (payment.currency !== event.currency) return "currency_mismatch";
  if (payment.providerPaymentId && event.checkoutId && payment.providerPaymentId !== event.checkoutId) return "checkout_mismatch";
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

