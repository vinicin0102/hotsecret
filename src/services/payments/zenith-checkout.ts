// Checkout pela Zenith Payments API (MXN, ARS): o comprador informa os dados que o catálogo do método
// pede, cada intenção de compra tem a sua Idempotency-Key persistida e o resultado incerto (timeout/5xx)
// é resolvido reenviando a MESMA intenção antes de criar outra.
import { randomUUID } from "node:crypto";
import type { Payment, Prisma, Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api";
import { absoluteUrl } from "@/lib/paths";
import type { LeadSession } from "@/lib/auth";
import { trackEvent } from "../tracking";
import { addConversationMessage, applyPaymentStatus } from "./service";
import {
  buildZenithCheckoutPayload,
  fetchZenithCatalog,
  getZenithCheckoutStatus,
  mapZenithStatus,
  sendZenithIntent,
  usableZenithMethods,
  ZENITH_COUNTRY,
  ZenithError,
  ZenithValidationError,
  zenithCopyValue,
  zenithFormFields,
  type ZenithMethod,
} from "./zenith";

export interface ZenithPayerInput {
  /** código do método escolhido no catálogo (opcional quando só há um) */
  methodCode?: string;
  email: string;
  /** valores dos campos do catálogo (customerFields + fields) */
  customer: Record<string, string>;
}

/** recusas de dados do comprador → campo do formulário e motivo */
const CUSTOMER_FIELD_ERRORS: Record<string, [string, string]> = {
  CUSTOMER_NAME_REQUIRED: ["name", "required"],
  CUSTOMER_NAME_INVALID: ["name", "invalid_name"],
  CUSTOMER_EMAIL_INVALID: ["email", "invalid_email"],
};

const T = {
  unavailable: "Pagos no disponibles por el momento. Intenta de nuevo más tarde.",
  noMethod: "No hay un método de pago disponible para este monto.",
  chooseMethod: "Elige cómo quieres pagar.",
  invalid: "Revisa los datos marcados.",
  uncertain: "No pudimos confirmar la generación del pago. Toca de nuevo para continuar — no se cobrará dos veces.",
  rejected: "No se pudo generar el pago. Revisa tus datos e inténtalo de nuevo.",
};

/** Métodos do catálogo que este produto pode usar, com os campos que o comprador preenche. */
export async function zenithMethodsFor(product: Pick<Product, "price" | "currency">) {
  const country = ZENITH_COUNTRY[product.currency];
  if (!country) throw new HttpError(400, T.unavailable);
  try {
    const catalog = await fetchZenithCatalog(country, product.currency);
    return usableZenithMethods(catalog, product.price);
  } catch (e) {
    console.error("[zenith] catálogo indisponível", e instanceof ZenithError ? `${e.kind} ${e.status}` : e);
    throw new HttpError(503, T.unavailable);
  }
}

/** Versão do catálogo que vai para o navegador (sem nada além do que o formulário precisa). */
export function publicZenithMethod(m: ZenithMethod) {
  return {
    code: m.code,
    displayName: m.displayName ?? m.code,
    fields: zenithFormFields(m).map((f) => ({
      name: f.name,
      label: f.label ?? f.name,
      type: f.type ?? "text",
      required: !!f.required,
      autocomplete: f.autocomplete,
      maxLength: f.maxLength,
      placeholder: f.placeholder,
      options: f.options?.map((o) => ({ value: o.value, label: o.label ?? o.value })),
    })),
  };
}

export async function createZenithCheckout(
  ctx: { session: LeadSession; product: Product; offerNodeId: string; funnelSlug: string },
  payer: ZenithPayerInput | undefined,
): Promise<Payment> {
  const { session, product } = ctx;
  const currency = product.currency;
  const country = ZENITH_COUNTRY[currency];
  if (!country) throw new HttpError(400, T.unavailable);
  if (!payer) throw new HttpError(422, T.invalid, { code: "payer_required" });

  const methods = await zenithMethodsFor(product);
  if (!methods.length) throw new HttpError(503, T.noMethod);
  const method = payer.methodCode ? methods.find((m) => m.code === payer.methodCode) : methods.length === 1 ? methods[0] : undefined;
  if (!method) throw new HttpError(422, T.chooseMethod, { code: "method_required" });

  const returnUrl = absoluteUrl(`/f/${ctx.funnelSlug}`);
  const build = (referenceId: string) =>
    buildZenithCheckoutPayload({
      method,
      amount: product.price,
      currency,
      country,
      referenceId,
      customer: payer.customer,
      email: payer.email,
      returnUrl: `${returnUrl}?payment=${encodeURIComponent(referenceId)}`,
      cancelUrl: returnUrl,
    });

  // valida os dados antes de abrir qualquer intenção
  try {
    build("validate");
  } catch (e) {
    if (e instanceof ZenithValidationError) throw new HttpError(422, T.invalid, { code: "invalid_fields", fields: e.fields });
    throw e;
  }

  // 1) Já existe uma cobrança desta compra?
  const recent = await prisma.payment.findMany({
    where: {
      leadId: session.leadId,
      productId: product.id,
      provider: "zenith",
      status: { in: ["CREATED", "PENDING"] },
      createdAt: { gte: new Date(Date.now() - 25 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  const pending = recent.find((p) => p.status === "PENDING" && p.nextAction);
  if (pending) {
    // o comprador já tem os dados de pagamento — a menos que esse checkout tenha sido encerrado na Zenith
    const state = pending.providerPaymentId ? await getZenithCheckoutStatus(pending.providerPaymentId).catch(() => null) : null;
    if (!state || mapZenithStatus(state) !== "FAILED") return pending;
    await applyPaymentStatus(pending.id, "FAILED", "api_status");
  }

  // 2) Resultado incerto anterior: reenviar a MESMA intenção (mesma chave, mesmo corpo) antes de criar outra
  const uncertain = recent.find((p) => p.status === "CREATED" && p.uncertain && p.idempotencyKey && p.providerRequest);
  if (uncertain) {
    const sameBody = JSON.stringify(build(uncertain.id)) === uncertain.providerRequest;
    if (sameBody) return send(uncertain, ctx);
    // dados diferentes = outra intenção (nova chave); a anterior fica registrada e um webhook dela ainda é aceito
    await prisma.payment.update({ where: { id: uncertain.id }, data: { uncertain: false, providerRequest: null } });
    await prisma.payment.updateMany({ where: { id: uncertain.id, status: "CREATED" }, data: { status: "FAILED" } });
  }

  // 3) Nova intenção: chave UUID persistida junto com o corpo exato
  const name = [payer.customer.firstName, payer.customer.lastName].filter(Boolean).join(" ").trim() || payer.customer.name?.trim() || "Cliente";
  const payment = await prisma.payment.create({
    data: {
      leadId: session.leadId,
      conversationId: session.conversationId,
      funnelId: session.funnelId,
      productId: product.id,
      offerNodeId: ctx.offerNodeId,
      amount: product.price,
      currency,
      method: "PIX", // transferência instantânea (SPEI etc.); o método real fica em methodCode
      methodCode: method.code,
      status: "CREATED",
      provider: "zenith",
      customerName: name.slice(0, 140),
      customerEmail: payer.email.trim().toLowerCase().slice(0, 200),
      idempotencyKey: randomUUID(),
    },
  });
  // guarda o nome/e-mail que o lead digitou (sem sobrescrever o que já existe): na próxima compra vêm preenchidos
  const lead = await prisma.lead.findUnique({ where: { id: session.leadId }, select: { name: true, email: true } });
  if (lead && (!lead.name || !lead.email)) {
    await prisma.lead.update({
      where: { id: session.leadId },
      data: { ...(!lead.name && name !== "Cliente" ? { name: name.slice(0, 140) } : {}), ...(!lead.email ? { email: payer.email.trim().toLowerCase().slice(0, 200) } : {}) },
    });
  }
  // bytes exatos desta intenção: todo retry reenvia esta mesma string com a mesma chave
  const withBody = await prisma.payment.update({ where: { id: payment.id }, data: { providerRequest: JSON.stringify(build(payment.id)) } });
  await trackEvent({
    leadId: session.leadId,
    funnelId: session.funnelId,
    conversationId: session.conversationId,
    type: "payment_created",
    nodeId: ctx.offerNodeId,
    data: { paymentId: payment.id, productId: product.id, amount: product.price, method: method.code },
  });
  return send(withBody, ctx);
}

async function send(payment: Payment, ctx: { session: LeadSession; product: Product; offerNodeId: string }): Promise<Payment> {
  const outcome = await sendZenithIntent({
    idempotencyKey: payment.idempotencyKey!,
    body: payment.providerRequest!,
    referenceId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
  });

  if (outcome.kind === "uncertain") {
    // pode ter sido criada: fica como incerta e o próximo toque reenvia a mesma intenção
    await prisma.payment.update({ where: { id: payment.id }, data: { uncertain: true } });
    throw new HttpError(504, T.uncertain, { code: "uncertain" });
  }

  if (outcome.kind === "rejected") {
    // nada foi criado: encerra a intenção e apaga os dados pessoais do corpo guardado
    await prisma.payment.update({ where: { id: payment.id }, data: { uncertain: false, providerRequest: null } });
    await applyPaymentStatus(payment.id, "FAILED", "gateway_error");
    // nome/e-mail recusados pela Zenith: o formulário marca o campo (corrigir = nova intenção, nova chave)
    const field = CUSTOMER_FIELD_ERRORS[outcome.error.code ?? ""];
    if (field) throw new HttpError(422, T.invalid, { code: "invalid_fields", fields: { [field[0]]: field[1] } });
    throw new HttpError(502, T.rejected, { code: "rejected" });
  }

  const r = outcome.result;
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: r.checkoutId,
      gatewayPaymentId: r.paymentId,
      nextAction: (r.nextAction ?? undefined) as Prisma.InputJsonValue | undefined,
      // o valor que o comprador copia (CLABE...) aparece onde o chat já mostra o código de pagamento
      pixQrCode: zenithCopyValue(r.nextAction),
      redirectUrl: r.nextAction?.type === "redirect" && r.nextAction.url?.startsWith("https://") ? r.nextAction.url : null,
      uncertain: false,
      providerRequest: null,
    },
  });
  await addConversationMessage(
    ctx.session.conversationId,
    "user",
    "checkout",
    { text: `Pedido: ${ctx.product.name} — ${r.method?.displayName ?? payment.methodCode ?? ""}`.trim(), paymentId: payment.id },
    ctx.offerNodeId,
  );
  // aprovação NUNCA vem da resposta da criação: só do webhook assinado
  const st = mapZenithStatus(r.paymentStatus || r.status);
  await applyPaymentStatus(payment.id, st === "FAILED" ? "FAILED" : "PENDING", "checkout");
  return (await prisma.payment.findUnique({ where: { id: updated.id } }))!;
}
