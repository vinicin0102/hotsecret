// API de Conversões da Meta: envia a venda pelo servidor quando o gateway confirma o pagamento.
// Funciona mesmo se o lead fechou a página. O event_id é o id do pagamento — o mesmo usado
// pelo pixel do navegador — então a Meta conta a venda uma vez só (deduplicação, em cada pixel).
// Vai para todos os pixels do fluxo (uma conta de anúncios cada) e para o pixel próprio da oferta.
import { createHash } from "node:crypto";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/paths";
import type { FunnelSettings } from "@/types/flow";
import { getGlobalTracking, globalMetaPixels, mergeTracking, type GlobalTracking } from "./tracking-settings";
import { openSecret } from "@/lib/secret-box";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH_URL = (process.env.META_GRAPH_URL || "https://graph.facebook.com").replace(/\/$/, "");
const sha256 = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

type Lead = NonNullable<Awaited<ReturnType<typeof prisma.lead.findUnique>>>;

/** token de cada pixel: o cadastrado com ele nas Configurações (ou na oferta); sem token próprio, o 1º token configurado */
function tokenFinder(global: GlobalTracking, product?: { metaPixelId: string | null; metaCapiTokenSealed: string | null } | null) {
  const stored = globalMetaPixels(global);
  const fallback = stored.find((p) => p.token)?.token || global.metaCapiToken;
  const tokens = new Map(stored.filter((p) => p.token).map((p) => [p.id, p.token!]));
  if (product?.metaPixelId && product.metaCapiTokenSealed) {
    const own = openSecret(product.metaCapiTokenSealed);
    if (own) tokens.set(product.metaPixelId, own);
  }
  return (pixelId: string) => tokens.get(pixelId) || fallback || undefined;
}

/** evento Purchase de um pagamento aprovado (event_id = id do pagamento, o mesmo do pixel do navegador) */
function purchaseEvent(payment: Payment, lead: Lead, productName: string | undefined, funnelSlug: string | undefined) {
  const userData: Record<string, unknown> = { external_id: [sha256(lead.id)] };
  if (lead.clientIp && lead.clientIp !== "unknown") userData.client_ip_address = lead.clientIp;
  if (lead.userAgent) userData.client_user_agent = lead.userAgent;
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;
  if (lead.country) userData.country = [sha256(lead.country)];
  return {
    event_name: "Purchase",
    event_time: Math.floor((payment.approvedAt ?? new Date()).getTime() / 1000),
    event_id: payment.id,
    action_source: "website",
    event_source_url: funnelSlug ? absoluteUrl(`/f/${funnelSlug}`) : undefined,
    user_data: userData,
    custom_data: {
      currency: payment.currency || "BRL",
      value: payment.amount / 100,
      content_name: productName,
      content_ids: [payment.productId],
      content_type: "product",
      order_id: payment.id,
    },
  };
}

/** POST dos eventos para um pixel; a mensagem de erro da Meta volta (nunca o token) */
async function postEvents(pixelId: string, token: string, data: unknown[], testCode?: string): Promise<{ ok: true; received: number | null } | { ok: false; error: string }> {
  const res = await fetch(`${GRAPH_URL}/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data, ...(testCode ? { test_event_code: testCode } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
  const result = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string } };
  if (!res.ok) {
    console.error("[meta-capi] eventos recusados", pixelId, res.status, JSON.stringify(result).slice(0, 500));
    return { ok: false, error: result.error?.message?.slice(0, 300) || `HTTP ${res.status}` };
  }
  return { ok: true, received: result.events_received ?? null };
}

export async function sendMetaPurchase(payment: Payment): Promise<void> {
  const global = await getGlobalTracking();
  const [funnel, lead, product] = await Promise.all([
    payment.funnelId ? prisma.funnel.findUnique({ where: { id: payment.funnelId }, select: { slug: true, settings: true } }) : null,
    prisma.lead.findUnique({ where: { id: payment.leadId } }),
    prisma.product.findUnique({ where: { id: payment.productId }, select: { name: true, metaPixelId: true, metaCapiTokenSealed: true } }),
  ]);
  if (!lead) return;
  const tokenOf = tokenFinder(global, product);
  const pixels = [
    ...new Set([...(mergeTracking(global, (funnel?.settings as FunnelSettings | null)?.tracking).metaPixelIds ?? []), ...(product?.metaPixelId ? [product.metaPixelId] : [])]),
  ];
  const targets = pixels.map((id) => ({ id, token: tokenOf(id) })).filter((t): t is { id: string; token: string } => !!t.token);
  if (!targets.length) return;
  const event = purchaseEvent(payment, lead, product?.name, funnel?.slug);

  // um pixel recusar (token errado, pixel de outra conta) não impede os outros
  await Promise.all(
    targets.map(async ({ id, token }) => {
      try {
        const r = await postEvents(id, token, [event], global.metaTestEventCode);
        if (!r.ok) return;
        await prisma.event.create({
          data: {
            leadId: payment.leadId,
            funnelId: payment.funnelId,
            conversationId: payment.conversationId,
            type: "meta_capi_purchase",
            data: { paymentId: payment.id, pixelId: id, eventsReceived: r.received },
          },
        });
      } catch (e) {
        console.error("[meta-capi] Purchase falhou", id, e instanceof Error ? e.message : e);
      }
    }),
  );
}

/** a Meta só aceita eventos de até 7 dias atrás (margem de 30 min para o envio) */
const BACKFILL_MS = 7 * 24 * 3600_000 - 30 * 60_000;

/**
 * Pixel novo (outra conta de anúncios): manda para ele as vendas aprovadas dos últimos 7 dias que ele ainda não recebeu,
 * pela API de Conversões. Cada venda vai uma vez só por pixel (registrada como meta_capi_purchase com o pixelId).
 */
export async function backfillMetaPurchases(pixelId: string): Promise<{ sent: number; already: number; error?: string }> {
  const global = await getGlobalTracking();
  const token = tokenFinder(global)(pixelId);
  if (!token) return { sent: 0, already: 0, error: "Cadastre o token da API de Conversões deste pixel e salve antes de enviar." };
  const payments = await prisma.payment.findMany({
    where: { status: "APPROVED", approvedAt: { gte: new Date(Date.now() - BACKFILL_MS) } },
    orderBy: { approvedAt: "asc" },
  });
  if (!payments.length) return { sent: 0, already: 0 };
  const sentBefore = await prisma.event.findMany({
    where: { type: "meta_capi_purchase", data: { path: ["pixelId"], equals: pixelId } },
    select: { data: true },
  });
  const done = new Set(sentBefore.map((e) => (e.data as { paymentId?: string } | null)?.paymentId));
  const todo = payments.filter((p) => !done.has(p.id));
  if (!todo.length) return { sent: 0, already: payments.length };

  const [leads, products, funnels] = await Promise.all([
    prisma.lead.findMany({ where: { id: { in: [...new Set(todo.map((p) => p.leadId))] } } }),
    prisma.product.findMany({ where: { id: { in: [...new Set(todo.map((p) => p.productId))] } }, select: { id: true, name: true } }),
    prisma.funnel.findMany({ where: { id: { in: [...new Set(todo.flatMap((p) => (p.funnelId ? [p.funnelId] : [])))] } }, select: { id: true, slug: true } }),
  ]);
  const leadOf = new Map(leads.map((l) => [l.id, l]));
  const nameOf = new Map(products.map((p) => [p.id, p.name]));
  const slugOf = new Map(funnels.map((f) => [f.id, f.slug]));
  const ready = todo.filter((p) => leadOf.has(p.leadId));

  let sent = 0;
  for (let i = 0; i < ready.length; i += 500) {
    const batch = ready.slice(i, i + 500);
    const r = await postEvents(
      pixelId,
      token,
      batch.map((p) => purchaseEvent(p, leadOf.get(p.leadId)!, nameOf.get(p.productId), p.funnelId ? slugOf.get(p.funnelId) : undefined)),
      global.metaTestEventCode,
    );
    if (!r.ok) return { sent, already: payments.length - todo.length, error: r.error };
    await prisma.event.createMany({
      data: batch.map((p) => ({
        leadId: p.leadId,
        funnelId: p.funnelId,
        conversationId: p.conversationId,
        type: "meta_capi_purchase",
        data: { paymentId: p.id, pixelId, backfill: true },
      })),
    });
    sent += batch.length;
  }
  return { sent, already: payments.length - todo.length };
}
