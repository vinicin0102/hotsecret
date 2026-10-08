import { mercadoPagoProvider } from "./mercadopago";
import { sandboxProvider } from "./sandbox";
import { zuckPayProvider } from "./zuckpay";
import { zenithProvider } from "./zenith-provider";
import type { PaymentProvider } from "./types";

const providers: Record<string, PaymentProvider> = {
  mercadopago: mercadoPagoProvider,
  sandbox: sandboxProvider,
  zuckpay: zuckPayProvider,
  zenith: zenithProvider,
};

export function sandboxAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ALLOW_SANDBOX_PAYMENTS === "true";
}

export function getProvider(name?: string): PaymentProvider {
  const key = name ?? process.env.PAYMENT_PROVIDER ?? "sandbox";
  if (key === "sandbox" && !sandboxAllowed()) {
    throw new Error("Provedor sandbox desabilitado em produção. Configure PAYMENT_PROVIDER=mercadopago.");
  }
  const p = providers[key];
  if (!p) throw new Error(`Provedor de pagamento desconhecido: ${key}`);
  return p;
}

export function activeProviderName(): string {
  return process.env.PAYMENT_PROVIDER ?? "sandbox";
}

/**
 * Gateway de cada moeda: BRL usa PAYMENT_PROVIDER (PIX); as outras moedas usam PAYMENT_PROVIDER_<MOEDA>
 * (ex.: PAYMENT_PROVIDER_MXN=zenith). Sem configuração, só o sandbox cobra (ambiente de teste).
 * Retorna "" quando a moeda não tem gateway.
 */
export function providerNameForCurrency(currency: string): string {
  if (currency === "BRL") return activeProviderName();
  const own = process.env[`PAYMENT_PROVIDER_${currency}`];
  if (own) return own;
  return activeProviderName() === "sandbox" ? "sandbox" : "";
}
