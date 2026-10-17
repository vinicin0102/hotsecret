// Ciclo de vida dos pagamentos:
// payment_created → payment_pending → payment_approved | payment_failed → payment_refunded
// Um pagamento só é APROVADO quando o gateway confirma (webhook validado ou consulta à API).
import type { Payment, PaymentMethod, PaymentStatus, Prisma, Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/api";
import { randomBytes } from "node:crypto";
import { absoluteUrl } from "@/lib/paths";
import type { LeadSession } from "@/lib/auth";
import { trackEvent } from "../tracking";
import { addTagToLead, ensureTag } from "../tags";
import { getProvider, providerNameForCurrency } from "./index";
import { createZenithCheckout, type ChargeOwner, type ZenithPayerInput } from "./zenith-checkout";
import { asCurrency, currencyOfLocale } from "@/lib/format";
import { getFunnelSettings } from "../funnels";
import { sendMetaPurchase } from "../meta-capi";
import { brainOffers, brainVoiceCalls } from "../ai/brain";
import { publicNextAction } from "./zenith";

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  CREATED: ["PENDING", "APPROVED", "FAILED"],
  PENDING: ["APPROVED", "FAILED"],
  FAILED: ["APPROVED"], // ex.: nova tentativa aprovada pelo gateway
  APPROVED: ["REFUNDED"],
  REFUNDED: [],
};

const STATUS_EVENT: Record<PaymentStatus, string> = {
  CREATED: "payment_created",
  PENDING: "payment_pending",
  APPROVED: "payment_approved",
  FAILED: "payment_failed",
  REFUNDED: "payment_refunded",
};

export function publicPayment(p: Payment) {
  return {
    id: p.id,
    status: p.status,
    method: p.method,
    amount: p.amount,
    currency: p.currency,
    pixQrCode: p.pixQrCode,
    pixQrCodeBase64: p.pixQrCodeBase64,
    redirectUrl: p.redirectUrl,
    methodCode: p.methodCode,
    /** instruções do gateway (ex.: CLABE, beneficiário e passos do SPEI) */
    nextAction: publicNextAction(p.nextAction),
    offerNodeId: p.offerNodeId,
    productId: p.productId,
    // o navegador só precisa saber se é teste (sandbox); o gateway real não é exposto
    provider: p.provider === "sandbox" ? "sandbox" : "live",
  };
}

export async function addConversationMessage(
  conversationId: string,
  sender: "bot" | "user" | "system",
  type: string,
  content: Prisma.InputJsonValue,
  nodeId?: string | null,
) {
  return prisma.message.create({ data: { conversationId, sender, type, content, nodeId: nodeId ?? null } });
}

interface CheckoutInput {
  offerNodeId: string;
  method: PaymentMethod;
  /** bloco Cérebro: produto da oferta que a IA mostrou */
  productId?: string;
  /** dados do comprador pedidos pelo catálogo do gateway (Zenith) */
  payer?: ZenithPayerInput;
}

/**
 * Dados do pagador enviados ao gateway. O visitante NÃO preenche nada: o gateway exige
 * nome/e-mail, então usamos dados do próprio SaaS. CHECKOUT_PAYER_NAME / CHECKOUT_PAYER_EMAIL
 * fixam os mesmos dados para todos; sem eles, gera um e-mail técnico por pagamento.
 */
export function payerIdentity(ref: string): { name: string; email: string } {
  const domain = process.env.CHECKOUT_PAYER_EMAIL_DOMAIN || "hotsecret.app";
  return {
    name: process.env.CHECKOUT_PAYER_NAME || "Cliente Hot Secret",
    email: process.env.CHECKOUT_PAYER_EMAIL || `pix.${ref.toLowerCase().replace(/[^a-z0-9]/g, "").slice(-12)}@${domain}`,
  };
}

export async function createCheckout(session: LeadSession, input: CheckoutInput) {

  const conversation = await prisma.conversation.findUnique({ where: { id: session.conversationId } });
  if (!conversation || conversation.leadId !== session.leadId) throw new HttpError(403, "Sessão inválida");

  const node = await prisma.funnelNode.findUnique({
    where: { funnelId_id: { funnelId: session.funnelId, id: input.offerNodeId } },
  });
  if (!node || (node.type !== "offer" && node.type !== "ai")) throw new HttpError(400, "Oferta inválida");
  let productId = (node.content as { productId?: string }).productId;
  if (node.type === "offer" && input.productId && input.productId !== productId) {
    // chamada de vídeo: downsell ao recusar ou upsells marcados no vídeo
    const videoId = (node.content as { videoId?: string }).videoId;
    const downsell = (node.content as { downsellProductId?: string }).downsellProductId;
    const video = videoId ? await prisma.video.findUnique({ where: { id: videoId } }) : null;
    const markers = ((video?.timeline as { markers?: { productId?: string; basicProductId?: string }[] } | null)?.markers ?? []) as {
      productId?: string;
      basicProductId?: string;
    }[];
    productId =
      downsell === input.productId || markers.some((m) => m.productId === input.productId || m.basicProductId === input.productId) ? input.productId : undefined;
  }
  if (node.type === "ai") {
    // só produtos cadastrados como oferta no cérebro deste bloco
    const brainId = (node.content as { brainId?: string }).brainId;
    const brain = brainId ? await prisma.brain.findUnique({ where: { id: brainId } }) : null;
    const offers = brain ? brainOffers(brain) : [];
    let allowed =
      !!input.productId &&
      (offers.some((o) => o.productId === input.productId || o.downsellProductId === input.productId) ||
        (brain ? brainVoiceCalls(brain).some((v) => v.productId === input.productId) : false));
    if (!allowed && input.productId) {
      // upsells marcados nos vídeos das ofertas em chamada
      const videoIds = [
        ...offers.filter((o) => (o.style === "call" || o.style === "live") && o.videoId).map((o) => o.videoId!),
        ...(brain ? brainVoiceCalls(brain).flatMap((v) => (v.videoId ? [v.videoId] : [])) : []),
      ];
      const videos = videoIds.length ? await prisma.video.findMany({ where: { id: { in: videoIds } } }) : [];
      allowed = videos.some((v) =>
        ((v.timeline as { markers?: { productId?: string; basicProductId?: string }[] } | null)?.markers ?? []).some(
          (m) => m.productId === input.productId || m.basicProductId === input.productId,
        ),
      );
    }
    productId = allowed ? input.productId : undefined;
  }
  const product = productId ? await prisma.product.findUnique({ where: { id: productId } }) : null;
  if (!product || !product.active) throw new HttpError(400, "Produto indisponível");

  // o país do fluxo decide a moeda: fluxo do Brasil só cobra em reais (PIX), do México só em pesos.
  // Produto de outra moeda (ex.: escolhido por engano num upsell do vídeo) nunca vira cobrança por outro meio.
  const funnel = await prisma.funnel.findUnique({ where: { id: session.funnelId }, select: { slug: true, settings: true } });
  const currency = asCurrency(product.currency);
  const flowCurrency = currencyOfLocale(getFunnelSettings(funnel?.settings).locale);
  if (currency !== flowCurrency) {
    console.warn(`[checkout] produto ${product.id} em ${currency} recusado no fluxo ${session.funnelId} (${flowCurrency})`);
    throw new HttpError(400, flowCurrency === "BRL" ? "Produto indisponível" : "Producto no disponible");
  }
  return chargeProduct(
    { leadId: session.leadId, conversationId: session.conversationId, funnelId: session.funnelId },
    product,
    { method: input.method, payer: input.payer, offerNodeId: input.offerNodeId, returnPath: `/f/${funnel?.slug ?? ""}` },
  );
}

/**
 * Gera a cobrança do produto no gateway da moeda dele (reais: PIX; pesos: Zenith).
 * Usado pelo chat (com conversa e bloco de oferta) e pelo Grupo VIP (sem conversa nem fluxo).
 * Quem chama já conferiu que o produto pode ser vendido ali.
 */
export async function chargeProduct(
  owner: ChargeOwner,
  product: Product,
  opts: { method: PaymentMethod; payer?: ZenithPayerInput; offerNodeId: string | null; returnPath: string },
) {
  const input = { method: opts.method, offerNodeId: opts.offerNodeId };
  const session = owner;
  const currency = asCurrency(product.currency);
  const providerName = providerNameForCurrency(currency);
  const es = currency !== "BRL";
  if (providerName === "zenith") {
    return createZenithCheckout({ owner, product, offerNodeId: opts.offerNodeId, returnPath: opts.returnPath }, opts.payer);
  }

  // Reaproveita um pagamento pendente recente (evita cobranças duplicadas por duplo clique).
  const recent = await prisma.payment.findFirst({
    where: {
      leadId: session.leadId,
      productId: product.id,
      method: input.method,
      status: { in: ["CREATED", "PENDING"] },
      createdAt: { gte: new Date(Date.now() - 25 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent && (recent.pixQrCode || recent.redirectUrl || recent.provider === "sandbox")) return recent;

  let provider;
  try {
    // reais: PIX (PAYMENT_PROVIDER); outras moedas: gateway próprio (PAYMENT_PROVIDER_<MOEDA>)
    if (!providerName) throw new Error(`gateway da moeda ${currency} não configurado`);
    provider = getProvider(providerName);
  } catch (err) {
    console.error("[checkout] gateway não configurado", err);
    throw new HttpError(503, es ? "Pagos no disponibles por el momento. Intenta de nuevo más tarde." : "Pagamentos indisponíveis no momento. Tente novamente mais tarde.");
  }
  const payer = payerIdentity(randomBytes(6).toString("hex"));
  const payment = await prisma.payment.create({
    data: {
      leadId: session.leadId,
      conversationId: session.conversationId,
      funnelId: session.funnelId,
      productId: product.id,
      offerNodeId: input.offerNodeId,
      amount: product.price,
      currency,
      method: input.method,
      status: "CREATED",
      provider: provider.name,
      customerName: payer.name,
      customerEmail: payer.email,
    },
  });
  await trackEvent({
    leadId: session.leadId,
    funnelId: session.funnelId,
    conversationId: session.conversationId,
    type: "payment_created",
    nodeId: input.offerNodeId,
    data: { paymentId: payment.id, productId: product.id, amount: product.price, method: input.method },
  });

  let result;
  try {
    result = await provider.createPayment({
      paymentId: payment.id,
      amount: product.price,
      currency,
      description: product.name,
      method: input.method,
      customer: payer,
      notificationUrl: absoluteUrl(`/api/webhooks/payments/${provider.name}`),
      returnUrl: absoluteUrl(`${opts.returnPath}?payment=${payment.id}`),
    });
  } catch (err) {
    console.error("[checkout] falha no gateway", err);
    await applyPaymentStatus(payment.id, "FAILED", "gateway_error");
    throw new HttpError(502, "Não foi possível gerar o pagamento agora. Tente novamente em instantes.");
  }

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      providerPaymentId: result.providerPaymentId,
      pixQrCode: result.pixQrCode ?? null,
      pixQrCodeBase64: result.pixQrCodeBase64 ?? null,
      redirectUrl: result.redirectUrl ?? null,
    },
  });
  if (session.conversationId) {
    await addConversationMessage(session.conversationId, "user", "checkout", {
      text: `Pedido: ${product.name} — ${input.method === "PIX" ? "PIX" : "Cartão"}`,
      paymentId: payment.id,
    }, input.offerNodeId);
  }
  await applyPaymentStatus(payment.id, result.status === "CREATED" ? "PENDING" : result.status, "checkout");
  return (await prisma.payment.findUnique({ where: { id: updated.id } }))!;
}

/**
 * Aplica um novo status de forma idempotente, registra eventos, mensagens e tags.
 * Chamado SOMENTE a partir de confirmações do gateway (webhook/API) ou do sandbox.
 */
export async function applyPaymentStatus(paymentId: string, status: PaymentStatus, source: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;
  if (payment.status === status) return payment;
  if (!ALLOWED_TRANSITIONS[payment.status].includes(status)) {
    console.warn(`[payments] transição ignorada ${payment.status} → ${status} (${paymentId})`);
    return payment;
  }

  // Atualização condicional evita processar o mesmo webhook duas vezes em paralelo.
  const { count } = await prisma.payment.updateMany({
    where: { id: paymentId, status: payment.status },
    data: { status, ...(status === "APPROVED" ? { approvedAt: new Date() } : {}) },
  });
  if (count === 0) return prisma.payment.findUnique({ where: { id: paymentId } });

  await trackEvent({
    leadId: payment.leadId,
    funnelId: payment.funnelId,
    conversationId: payment.conversationId,
    type: STATUS_EVENT[status],
    nodeId: payment.offerNodeId,
    data: { paymentId, amount: payment.amount, productId: payment.productId, source },
  });

  if (payment.conversationId && (status === "APPROVED" || status === "FAILED" || status === "REFUNDED")) {
    // pagamento em pesos (México/Argentina) = mensagem em espanhol
    const es = payment.currency !== "BRL";
    const text =
      status === "APPROVED"
        ? es
          ? "Pago aprobado ✅"
          : "Pagamento aprovado ✅"
        : status === "FAILED"
          ? es
            ? "Pago no aprobado"
            : "Pagamento não aprovado"
          : es
            ? "Pago reembolsado"
            : "Pagamento estornado";
    await addConversationMessage(payment.conversationId, "system", "payment_update", { text, status, paymentId });
  }

  if (status === "APPROVED") {
    const tag = await ensureTag("COMPROU", "#D8A85C");
    await addTagToLead(payment.leadId, tag.id, "automation");
    // venda na API de Conversões da Meta (falha aqui nunca afeta o pagamento)
    const approved = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (approved) await sendMetaPurchase(approved).catch((e) => console.error("[meta-capi]", e));
    // Grupo VIP liberado para quem comprou qualquer produto: o link de acesso aparece no chat
    if (approved) await import("../vip").then((m) => m.grantVipAccessMessage(approved)).catch((e) => console.error("[vip-access]", e));
  }
  return prisma.payment.findUnique({ where: { id: paymentId } });
}

/** Consulta o gateway quando o webhook atrasa (máx. 1 consulta a cada 8s por pagamento). */
export async function syncPaymentWithProvider(payment: Payment): Promise<Payment> {
  if (!payment.providerPaymentId || payment.status === "APPROVED" || payment.status === "REFUNDED") return payment;
  // consulta ao gateway com intervalo maior para PIX antigo (o webhook confirma na hora; isto é só reforço):
  // até 2 min: a cada 8s · até 10 min: 20s · depois: 60s — com muitos leads ao mesmo tempo, não sobrecarrega o gateway
  const age = Date.now() - payment.createdAt.getTime();
  const gap = age < 2 * 60_000 ? 8_000 : age < 10 * 60_000 ? 20_000 : 60_000;
  if (payment.lastSyncedAt && Date.now() - payment.lastSyncedAt.getTime() < gap) return payment;
  await prisma.payment.update({ where: { id: payment.id }, data: { lastSyncedAt: new Date() } });
  try {
    const info = await getProvider(payment.provider).fetchPayment(payment.providerPaymentId);
    // alguns gateways não devolvem a referência externa na consulta; o id do gateway já identifica o pagamento
    const sameRef = !info?.externalReference || info.externalReference === payment.id;
    if (info && sameRef && info.status !== payment.status) {
      return (await applyPaymentStatus(payment.id, info.status, "api_sync")) ?? payment;
    }
  } catch (err) {
    console.error("[payments] sync falhou", err);
  }
  return payment;
}
