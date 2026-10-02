// Integração ZuckPay (API v3) — https://github.com/ZuckPay/zuckpay-mcp (referência oficial)
// - Cobrança PIX: POST /v3/pix/qrcode → copia e cola + QR Code dentro do chat
// - Status: GET /v3/pix/status (fonte da verdade; consultado também a cada webhook)
// - Webhook: X-ZuckPay-Signature "t=<ts>,v1=<hex>", v1 = HMAC-SHA256("<ts>.<corpo cru>", ZUCKPAY_WEBHOOK_SECRET)
// A API exige nome, CPF, e-mail e telefone do pagador; como o visitante não preenche nada,
// esses dados vêm de CHECKOUT_PAYER_* (dados do próprio SaaS).
import type { PaymentStatus } from "@prisma/client";
import { hmacSha256Hex, header, safeEqualHex } from "./crypto";
import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider, ProviderPaymentInfo, WebhookRequest, WebhookVerification } from "./types";

const BASE_URL = (process.env.ZUCKPAY_BASE_URL || "https://www.zuckpay.com.br/conta").replace(/\/$/, "");

export function mapZuckPayStatus(s: string | undefined): PaymentStatus {
  switch ((s ?? "").toUpperCase()) {
    case "PAID":
    case "APPROVED":
    case "COMPLETED":
      return "APPROVED";
    case "FAILED":
    case "REFUSED":
    case "EXPIRED":
    case "EXPIRADO":
    case "CANCELED":
    case "CANCELLED":
      return "FAILED";
    case "REFUNDED":
    case "CHARGEBACK":
      return "REFUNDED";
    default:
      return "PENDING"; // PENDING, WAITING_PAYMENT
  }
}

function authHeader(): string {
  // aceita também CLIENT_ID / CLIENT_SECRET (nomes usados no painel da ZuckPay)
  const id = process.env.ZUCKPAY_CLIENT_ID || process.env.CLIENT_ID;
  const secret = process.env.ZUCKPAY_CLIENT_SECRET || process.env.CLIENT_SECRET;
  if (!id || !secret) throw new Error("ZUCKPAY_CLIENT_ID / ZUCKPAY_CLIENT_SECRET não configurados");
  return "Basic " + Buffer.from(`${id}:${secret}`, "utf8").toString("base64");
}

async function zp<T>(method: "GET" | "POST", path: string, opts: { query?: Record<string, string>; body?: unknown } = {}): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: "error", // sem "www" o CDN faz 301 e converte POST em GET
      signal: controller.signal,
    });
    const text = await res.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`ZuckPay respondeu ${res.status} com corpo não-JSON`);
    }
    if (!res.ok) {
      const msg = (data as { message?: string; error?: string }).message ?? (data as { error?: string }).error;
      console.error("[zuckpay]", method, path, res.status, msg);
      throw new Error(`ZuckPay respondeu ${res.status}${msg ? `: ${msg}` : ""}`);
    }
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

const str = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
};

/** Dados fixos do pagador exigidos pela ZuckPay (configurados pelo dono do SaaS). */
function payerExtras() {
  const cpf = (process.env.CHECKOUT_PAYER_CPF ?? "").replace(/\D/g, "");
  const telefone = (process.env.CHECKOUT_PAYER_PHONE ?? "").replace(/\D/g, "");
  if (cpf.length !== 11 || telefone.length < 10) {
    throw new Error("Configure CHECKOUT_PAYER_CPF (11 dígitos) e CHECKOUT_PAYER_PHONE (com DDD) para usar a ZuckPay");
  }
  return { cpf, telefone };
}

export const zuckPayProvider: PaymentProvider = {
  name: "zuckpay",

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const body: Record<string, unknown> = {
      nome: input.customer.name,
      email: input.customer.email,
      ...payerExtras(),
      valor: Number((input.amount / 100).toFixed(2)),
      descricao: input.description.slice(0, 255),
      external_id_client: input.paymentId, // idempotência: repetir devolve a mesma cobrança pendente
    };
    if (input.notificationUrl.startsWith("https://")) body.urlnoty = input.notificationUrl;
    const data = await zp<Record<string, unknown>>("POST", "/v3/pix/qrcode", { body });
    const transactionId = str(data, "transactionId", "transaction_id", "id");
    const image = str(data, "qrcode_image");
    return {
      providerPaymentId: transactionId ?? null,
      status: "PENDING",
      pixQrCode: str(data, "qrcode") ?? null,
      // pode vir como URL, data URI ou base64 puro (o front trata os três)
      pixQrCodeBase64: image ?? null,
      redirectUrl: input.method === "CARD" ? (str(data, "checkout_url") ?? null) : null,
    };
  },

  async fetchPayment(providerPaymentId: string): Promise<ProviderPaymentInfo | null> {
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(providerPaymentId)) return null;
    const data = await zp<Record<string, unknown>>("GET", "/v3/pix/status", { query: { transactionId: providerPaymentId } });
    return {
      providerPaymentId: str(data, "transactionId", "transaction_id", "id") ?? providerPaymentId,
      status: mapZuckPayStatus(str(data, "status")),
      externalReference: str(data, "external_id_client") ?? null,
    };
  },

  verifyWebhook(req: WebhookRequest): WebhookVerification {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(req.rawBody || "{}");
    } catch {
      return { valid: false };
    }
    const nested = (typeof body.data === "object" && body.data ? body.data : {}) as Record<string, unknown>;
    const providerPaymentId = str(body, "transactionId", "transaction_id", "id") ?? str(nested, "transactionId", "transaction_id", "id");
    const externalReference = str(body, "external_id_client") ?? str(nested, "external_id_client");

    const secret = process.env.ZUCKPAY_WEBHOOK_SECRET;
    if (secret) {
      const parts: Record<string, string> = {};
      for (const piece of String(header(req.headers, "x-zuckpay-signature") ?? "").split(",")) {
        const i = piece.indexOf("=");
        if (i > 0) parts[piece.slice(0, i).trim()] = piece.slice(i + 1).trim();
      }
      const ts = Number(parts.t);
      if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return { valid: false };
      if (!safeEqualHex(hmacSha256Hex(secret, `${parts.t}.${req.rawBody}`), parts.v1 ?? "")) return { valid: false };
    }
    // Sem segredo configurado o postback é só um aviso: o status é SEMPRE consultado na API autenticada.
    return { valid: true, signed: !!secret, providerPaymentId, externalReference, eventType: "payment" };
  },
};
