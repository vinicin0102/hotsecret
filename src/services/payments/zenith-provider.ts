// Provedor "zenith" no registro de gateways. A cobrança tem fluxo próprio (zenith-checkout.ts:
// dados do comprador + idempotência) e a confirmação vem só do webhook assinado (zenith-webhook.ts).
import type { PaymentProvider } from "./types";

export const zenithProvider: PaymentProvider = {
  name: "zenith",
  async createPayment() {
    throw new Error("Zenith: use createZenithCheckout (precisa dos dados do comprador)");
  },
  // Sem consulta ativa: o status só muda por webhook assinado.
  async fetchPayment() {
    return null;
  },
  verifyWebhook() {
    return { valid: false };
  },
};
