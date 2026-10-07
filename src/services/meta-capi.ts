// API de Conversões da Meta: envia a venda pelo servidor quando o gateway confirma o pagamento.
// Funciona mesmo se o lead fechou a página. O event_id é o id do pagamento — o mesmo usado
// pelo pixel do navegador — então a Meta conta a venda uma vez só (deduplicação).
import { createHash } from "node:crypto";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/paths";
import type { FunnelSettings } from "@/types/flow";
import { getGlobalTracking, mergeTracking } from "./tracking-settings";
import { openSecret } from "@/lib/secret-box";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH_URL = (process.env.META_GRAPH_URL || "https://graph.facebook.com").replace(/\/$/, "");
const sha256 = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

export async function sendMetaPurchase(payment: Payment): Promise<void> {
  const global = await getGlobalTracking();
  const [funnel, lead, product] = await Promise.all([
    payment.funnelId ? prisma.funnel.findUnique({ where: { id: payment.funnelId }, select: { slug: true, settings: true } }) : null,
    prisma.lead.findUnique({ where: { id: payment.leadId } }),
    prisma.product.findUnique({ where: { id: payment.productId }, select: { name: true, metaPixelId: true, metaCapiTokenSealed: true } }),
  ]);
  // oferta com pixel próprio: a venda vai para ele (com o token dele, se tiver; senão o padrão)
  const metaPixelId = product?.metaPixelId || mergeTracking(global, (funnel?.settings as FunnelSettings | null)?.tracking).metaPixelId;
  const token = (product?.metaPixelId && product.metaCapiTokenSealed ? openSecret(product.metaCapiTokenSealed) : null) || global.metaCapiToken;
  if (!token || !metaPixelId || !lead) return;

  const userData: Record<string, unknown> = { external_id: [sha256(lead.id)] };
  if (lead.clientIp && lead.clientIp !== "unknown") userData.client_ip_address = lead.clientIp;
  if (lead.userAgent) userData.client_user_agent = lead.userAgent;
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;
  if (lead.country) userData.country = [sha256(lead.country)];

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor((payment.approvedAt ?? new Date()).getTime() / 1000),
        event_id: payment.id,
        action_source: "website",
        event_source_url: funnel ? absoluteUrl(`/f/${funnel.slug}`) : undefined,
        user_data: userData,
        custom_data: {
          currency: "BRL",
          value: payment.amount / 100,
          content_name: product?.name,
          content_ids: [payment.productId],
          content_type: "product",
          order_id: payment.id,
        },
      },
    ],
  };
  if (global.metaTestEventCode) body.test_event_code = global.metaTestEventCode;

  const res = await fetch(`${GRAPH_URL}/${GRAPH_VERSION}/${metaPixelId}/events?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[meta-capi] Purchase recusado", res.status, JSON.stringify(result).slice(0, 500));
    return;
  }
  await prisma.event.create({
    data: {
      leadId: payment.leadId,
      funnelId: payment.funnelId,
      conversationId: payment.conversationId,
      type: "meta_capi_purchase",
      data: { paymentId: payment.id, eventsReceived: (result as { events_received?: number }).events_received ?? null },
    },
  });
}
