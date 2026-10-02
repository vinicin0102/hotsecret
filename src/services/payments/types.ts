import type { PaymentMethod, PaymentStatus } from "@prisma/client";

export interface CreatePaymentInput {
  paymentId: string; // id interno (external_reference)
  amount: number; // centavos
  description: string;
  method: PaymentMethod;
  customer: { name: string; email: string };
  notificationUrl: string;
  returnUrl: string;
}

export interface CreatePaymentResult {
  providerPaymentId: string | null;
  status: PaymentStatus;
  pixQrCode?: string | null;
  pixQrCodeBase64?: string | null;
  redirectUrl?: string | null;
}

export interface ProviderPaymentInfo {
  providerPaymentId: string;
  status: PaymentStatus;
  externalReference: string | null;
}

export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export interface WebhookVerification {
  valid: boolean;
  providerPaymentId?: string;
  eventType?: string;
  /** status informado pelo próprio webhook (apenas sandbox — gateways reais são consultados via API) */
  status?: PaymentStatus;
  externalReference?: string;
  /** true quando a assinatura foi verificada (dados do corpo são confiáveis) */
  signed?: boolean;
}

export interface PaymentProvider {
  name: string;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Consulta o status real diretamente no gateway (fonte da verdade). */
  fetchPayment(providerPaymentId: string): Promise<ProviderPaymentInfo | null>;
  verifyWebhook(req: WebhookRequest): WebhookVerification;
}
