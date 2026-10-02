// Provedor SANDBOX — apenas para desenvolvimento e testes de ponta a ponta.
// Não movimenta dinheiro. Aprovação ocorre por webhook assinado (HMAC) ou pelo botão
// "Simular" no painel de Pagamentos. Bloqueado em produção salvo ALLOW_SANDBOX_PAYMENTS=true.
import { randomBytes } from "node:crypto";
import type { PaymentStatus } from "@prisma/client";
import { hmacSha256Hex, header, safeEqualHex } from "./crypto";
import type { CreatePaymentInput, CreatePaymentResult, PaymentProvider, WebhookRequest, WebhookVerification } from "./types";

export function sandboxSecret(): string {
  return process.env.SANDBOX_WEBHOOK_SECRET || process.env.AUTH_SECRET || "dev-sandbox-secret";
}

export const sandboxProvider: PaymentProvider = {
  name: "sandbox",

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const providerPaymentId = `sbx_${randomBytes(8).toString("hex")}`;
    if (input.method === "PIX") {
      return {
        providerPaymentId,
        status: "PENDING",
        pixQrCode: `00020126SANDBOX-HOTSECRET-${providerPaymentId}-${(input.amount / 100).toFixed(2)}5204000053039865802BR`,
        pixQrCodeBase64: null,
      };
    }
    return { providerPaymentId, status: "PENDING", redirectUrl: null };
  },

  async fetchPayment() {
    return null; // o sandbox não tem API externa; o status vem dos webhooks assinados
  },

  verifyWebhook(req: WebhookRequest): WebhookVerification {
    const signature = header(req.headers, "x-hotsecret-signature") ?? "";
    const valid = safeEqualHex(hmacSha256Hex(sandboxSecret(), req.rawBody), signature);
    if (!valid) return { valid: false };
    const body = JSON.parse(req.rawBody) as { providerPaymentId: string; status: PaymentStatus; type?: string };
    return { valid, providerPaymentId: body.providerPaymentId, status: body.status, eventType: body.type ?? "payment" };
  },
};

/** Dispara um webhook assinado do sandbox pelo mesmo caminho de produção (usado nos botões de teste). */
export async function simulateSandboxWebhook(providerPaymentId: string, status: PaymentStatus) {
  const { hmacSha256Hex: sign } = await import("./crypto");
  const { handlePaymentWebhook } = await import("./webhooks");
  const rawBody = JSON.stringify({ type: "payment", providerPaymentId, status });
  return handlePaymentWebhook("sandbox", {
    headers: { "x-hotsecret-signature": sign(sandboxSecret(), rawBody) },
    query: {},
    rawBody,
  });
}
