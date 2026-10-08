// Partes puras do webhook da Zenith (sem banco): assinatura, leitura do evento e consumidor idempotente.
import { createHmac } from "node:crypto";
import type { PaymentStatus } from "@prisma/client";
import { header, safeEqualHex } from "./crypto";
import type { WebhookRequest } from "./types";

/**
 * O que o evento faz com o pedido (documentação Zenith): só payment.captured / checkout.succeeded liberam;
 * payment.failed recusa; deposit.credited é entrada avulsa (nunca vira venda); o resto é ignorado.
 */
export type ZenithEventAction = "approve" | "fail" | "refund" | "deposit" | "ignore";

export interface ZenithWebhookEvent {
  /** X-Zenith-Event-Id (unicidade) */
  id: string;
  /** id do evento no corpo, quando vier (também é registrado: o cabeçalho não entra na assinatura) */
  bodyId: string | null;
  /** ex.: payment.captured */
  type: string;
  action: ZenithEventAction;
  referenceId: string | null;
  amount: number | null;
  currency: string | null;
  checkoutId: string | null;
  paymentId: string | null;
  depositId: string | null;
  reconciliationReason: string | null;
}

/** Tolerância do timestamp do webhook (segundos), como na documentação da Zenith. */
export const ZENITH_WEBHOOK_TOLERANCE_S = 300;

/**
 * Assinatura do webhook (documentação oficial da Zenith):
 * X-Zenith-Timestamp (segundos) e X-Zenith-Signature = hex(HMAC-SHA256(ZENITH_WEBHOOK_SECRET, "<timestamp>." + corpo bruto)).
 * Exige também X-Zenith-Event-Id e X-Zenith-Event-Type. Sem segredo configurado, tudo é recusado.
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
  if (!header(req.headers, "x-zenith-event-id") || !header(req.headers, "x-zenith-event-type")) return { ok: false, reason: "X-Zenith-Event-Id/Type ausentes" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "timestamp inválido" };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > ZENITH_WEBHOOK_TOLERANCE_S) return { ok: false, reason: "timestamp fora da janela" };
  if (!/^[0-9a-f]+$/i.test(received)) return { ok: false, reason: "assinatura inválida" };
  const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(req.rawBody, "utf8").digest("hex");
  if (!safeEqualHex(expected, received.toLowerCase())) return { ok: false, reason: "assinatura inválida" };
  return { ok: true };
}

const str = (v: unknown) => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : undefined);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);

/** Tipo do evento → ação (só os tipos documentados liberam pedido). */
export function zenithEventAction(type: string): ZenithEventAction {
  switch (type.toLowerCase()) {
    case "payment.captured":
    case "checkout.succeeded":
      return "approve";
    case "payment.failed":
    case "checkout.failed":
    case "checkout.canceled":
      return "fail";
    case "payment.refunded":
    case "checkout.refunded":
      return "refund";
    case "deposit.credited":
      return "deposit";
    default:
      return "ignore"; // payment.pending e outros: estado pendente nunca é receita
  }
}

/** Lê o evento já autenticado (cabeçalhos + corpo). null = sem id/tipo ou tipo do corpo diferente do cabeçalho. */
export function parseZenithEvent(req: Pick<WebhookRequest, "headers" | "rawBody">): ZenithWebhookEvent | null {
  let body: Record<string, unknown> | undefined;
  try {
    body = obj(JSON.parse(req.rawBody));
  } catch {
    return null;
  }
  if (!body) return null;
  const id = header(req.headers, "x-zenith-event-id")?.trim();
  const headerType = header(req.headers, "x-zenith-event-type")?.trim();
  const bodyType = str(body.type);
  // o corpo é assinado, o cabeçalho não: se os dois vierem, precisam bater
  if (!id || !headerType || (bodyType && bodyType !== headerType)) return null;
  const type = bodyType ?? headerType;
  const data = obj(body.data) ?? {};
  const checkout = obj(data.checkout) ?? {};
  const payment = obj(data.payment) ?? {};
  const pick = (k: string) => data[k] ?? checkout[k] ?? payment[k];
  const amount = pick("amount");
  return {
    id: id.slice(0, 200),
    bodyId: str(body.id)?.slice(0, 200) ?? null,
    type,
    action: zenithEventAction(type),
    referenceId: str(pick("referenceId")) ?? null,
    amount: typeof amount === "number" && Number.isInteger(amount) ? amount : null,
    currency: str(pick("currency"))?.toUpperCase() ?? null,
    checkoutId: str(data.checkoutId) ?? str(checkout.id) ?? null,
    paymentId: str(data.paymentId) ?? str(payment.id) ?? null,
    depositId: str(data.depositId) ?? null,
    reconciliationReason: str(data.reconciliationReason) ?? str(data.reconciliationStatus) ?? null,
  };
}

/** Acesso ao banco usado pelo consumidor (separado para os testes). */
export interface ZenithWebhookStore {
  findPayment(id: string): Promise<{ id: string; provider: string; amount: number; currency: string; providerPaymentId: string | null; gatewayPaymentId: string | null } | null>;
  /** registra a chave de unicidade (id do evento, depósito...); false = já processada */
  markProcessed(key: string, paymentId: string | null): Promise<boolean>;
  unmark(key: string): Promise<void>;
  apply(paymentId: string, status: PaymentStatus): Promise<void>;
}

export type ZenithConsumeResult =
  | "applied"
  | "duplicate"
  | "ignored"
  | "deposit_recorded"
  | "unknown_payment"
  | "amount_missing"
  | "amount_mismatch"
  | "currency_missing"
  | "currency_mismatch"
  | "checkout_mismatch"
  | "payment_mismatch";

const STATUS: Record<"approve" | "fail" | "refund", PaymentStatus> = { approve: "APPROVED", fail: "FAILED", refund: "REFUNDED" };

/** Consumidor idempotente: cada X-Zenith-Event-Id (e cada depositId) é processado uma única vez. */
export async function consumeZenithEvent(event: ZenithWebhookEvent, store: ZenithWebhookStore): Promise<ZenithConsumeResult> {
  if (event.action === "ignore") return "ignored";
  // X-Zenith-Event-Id + id do corpo assinado: o cabeçalho sozinho poderia ser trocado num reenvio do mesmo corpo
  const keys = [event.id, ...(event.bodyId ? [`body:${event.bodyId}`] : [])];

  if (event.action === "deposit") {
    // entrada avulsa (UNMATCHED/AMBIGUOUS, valor divergente...): só registra — nunca marca venda por nome ou valor
    const depositKeys = [...keys, ...(event.depositId ? [`deposit:${event.depositId}`] : [])];
    const fresh = await Promise.all(depositKeys.map((k) => store.markProcessed(k, null)));
    return fresh.every(Boolean) ? "deposit_recorded" : "duplicate";
  }

  if (!event.referenceId) return "unknown_payment";
  const payment = await store.findPayment(event.referenceId);
  if (!payment || payment.provider !== "zenith") return "unknown_payment";
  const releases = event.action !== "fail";
  // liberar/estornar exige valor e moeda no evento, iguais aos do pedido
  if (event.amount === null) {
    if (releases) return "amount_missing";
  } else if (event.amount !== payment.amount) return "amount_mismatch";
  if (event.currency === null) {
    if (releases) return "currency_missing";
  } else if (event.currency !== payment.currency) return "currency_mismatch";
  if (payment.providerPaymentId && event.checkoutId && payment.providerPaymentId !== event.checkoutId) return "checkout_mismatch";
  if (payment.gatewayPaymentId && event.paymentId && payment.gatewayPaymentId !== event.paymentId) return "payment_mismatch";

  const marked: string[] = [];
  for (const k of keys) {
    if (!(await store.markProcessed(k, payment.id))) {
      for (const m of marked) await store.unmark(m);
      return "duplicate";
    }
    marked.push(k);
  }
  try {
    await store.apply(payment.id, STATUS[event.action]);
  } catch (e) {
    // falhou ao aplicar: libera os ids para a Zenith reenviar
    for (const m of marked) await store.unmark(m);
    throw e;
  }
  return "applied";
}
