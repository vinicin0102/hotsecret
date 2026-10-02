// Integração Mercado Pago:
// - PIX: API de pagamentos (/v1/payments) → QR Code dentro do chat.
// - Cartão: Checkout Pro (/checkout/preferences) → página segura do Mercado Pago.
// - Webhooks: assinatura x-signature (HMAC-SHA256) validada; o status SEMPRE é consultado na API.
import type { PaymentStatus } from "@prisma/client";
import { hmacSha256Hex, header, safeEqualHex } from "./crypto";
import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider, ProviderPaymentInfo, WebhookRequest, WebhookVerification } from "./types";

const API = "https://api.mercadopago.com";

function token(): string {
  const t = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!t) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  return t;
}

export function mapMercadoPagoStatus(s: string | undefined): PaymentStatus {
  switch (s) {
    case "approved":
      return "APPROVED";
    case "rejected":
    case "cancelled":
      return "FAILED";
    case "refunded":
    case "charged_back":
      return "REFUNDED";
    default:
      return "PENDING"; // pending, in_process, authorized, in_mediation
  }
}

async function mp<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[mercadopago]", path, res.status, body);
    throw new Error(`Mercado Pago respondeu ${res.status}`);
  }
  return body as T;
}

function splitName(full: string) {
  const [first, ...rest] = full.trim().split(/\s+/);
  return { first_name: first, last_name: rest.join(" ") || first };
}

export const mercadoPagoProvider: PaymentProvider = {
  name: "mercadopago",

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const payer = { email: input.customer.email, ...splitName(input.customer.name) };

    if (input.method === "PIX") {
      const data = await mp<{
        id: number;
        status: string;
        point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
      }>("/v1/payments", {
        method: "POST",
        idempotencyKey: input.paymentId,
        body: JSON.stringify({
          transaction_amount: input.amount / 100,
          description: input.description,
          payment_method_id: "pix",
          payer,
          external_reference: input.paymentId,
          notification_url: input.notificationUrl,
          date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }),
      });
      const tx = data.point_of_interaction?.transaction_data;
      return {
        providerPaymentId: String(data.id),
        status: mapMercadoPagoStatus(data.status),
        pixQrCode: tx?.qr_code ?? null,
        pixQrCodeBase64: tx?.qr_code_base64 ?? null,
      };
    }

    const pref = await mp<{ id: string; init_point: string }>("/checkout/preferences", {
      method: "POST",
      idempotencyKey: input.paymentId,
      body: JSON.stringify({
        items: [{ id: input.paymentId, title: input.description, quantity: 1, unit_price: input.amount / 100, currency_id: "BRL" }],
        payer: { name: payer.first_name, surname: payer.last_name, email: payer.email },
        external_reference: input.paymentId,
        notification_url: input.notificationUrl,
        back_urls: { success: input.returnUrl, pending: input.returnUrl, failure: input.returnUrl },
        auto_return: "approved",
        payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "bank_transfer" }], installments: 12 },
      }),
    });
    // O id do pagamento só existe após o cliente pagar; ele chega pelo webhook (external_reference).
    return { providerPaymentId: null, status: "PENDING", redirectUrl: pref.init_point };
  },

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentInfo | null> {
    if (!/^\d+$/.test(providerPaymentId)) return null;
    const data = await mp<{ id: number; status: string; external_reference?: string }>(`/v1/payments/${providerPaymentId}`);
    return {
      providerPaymentId: String(data.id),
      status: mapMercadoPagoStatus(data.status),
      externalReference: data.external_reference ?? null,
    };
  },

  verifyWebhook(req: WebhookRequest): WebhookVerification {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
    try {
      body = JSON.parse(req.rawBody || "{}");
    } catch {
      return { valid: false };
    }
    const q = req.query;
    const qDataId = Array.isArray(q["data.id"]) ? q["data.id"][0] : q["data.id"];
    const dataId = String(qDataId ?? body.data?.id ?? "");
    const eventType = body.type ?? (Array.isArray(q.type) ? q.type[0] : q.type) ?? body.action;
    if (!secret || !dataId) return { valid: false, eventType };

    const sig = header(req.headers, "x-signature") ?? "";
    const requestId = header(req.headers, "x-request-id") ?? "";
    const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
    if (!parts.ts || !parts.v1) return { valid: false, eventType };

    const idForManifest = /^[a-zA-Z0-9]+$/.test(dataId) ? dataId.toLowerCase() : dataId;
    const manifest = `id:${idForManifest};request-id:${requestId};ts:${parts.ts};`;
    const valid = safeEqualHex(hmacSha256Hex(secret, manifest), parts.v1);
    return { valid, providerPaymentId: dataId, eventType };
  },
};
