// API de Conversões da Meta: envia a venda pelo servidor quando o gateway confirma o pagamento.
// Funciona mesmo se o lead fechou a página. O event_id é o id do pagamento — o mesmo usado
// pelo pixel do navegador — então a Meta conta a venda uma vez só (deduplicação, em cada pixel).
// Vai para todos os pixels do fluxo (uma conta de anúncios cada) e para o pixel próprio da oferta.
import { createHash } from "node:crypto";
import type { Payment } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { absoluteUrl } from "@/lib/paths";
import type { FunnelSettings } from "@/types/flow";
import { getGlobalTracking, globalMetaPixels, mergeTracking } from "./tracking-settings";
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
  if (!lead) return;
  // token de cada pixel: o cadastrado com ele nas Configurações (ou na oferta); sem token próprio, o 1º token configurado
  const stored = globalMetaPixels(global);
  const fallback = stored.find((p) => p.token)?.token || global.metaCapiToken;
  const tokens = new Map(stored.filter((p) => p.token).map((p) => [p.id, p.token!]));
  if (product?.metaPixelId && product.metaCapiTokenSealed) {
    const own = openSecret(product.metaCapiTokenSealed);
    if (own) tokens.set(product.metaPixelId, own);
  }
  const pixels = [
    ...new Set([...(mergeTracking(global, (funnel?.settings as FunnelSettings | null)?.tracking).metaPixelIds ?? []), ...(product?.metaPixelId ? [product.metaPixelId] : [])]),
  ];
  const targets = pixels.map((id) => ({ id, token: tokens.get(id) || fallback })).filter((t): t is { id: string; token: string } => !!t.token);
  if (!targets.length) return;

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
          currency: payment.currency || "BRL",
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

  // um pixel recusar (token errado, pixel de outra conta) não impede os outros
  await Promise.all(
    targets.map(async ({ id, token }) => {
      try {
        const res = await fetch(`${GRAPH_URL}/${GRAPH_VERSION}/${id}/events?access_token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(8000),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[meta-capi] Purchase recusado", id, res.status, JSON.stringify(result).slice(0, 500));
          return;
        }
        await prisma.event.create({
          data: {
            leadId: payment.leadId,
            funnelId: payment.funnelId,
            conversationId: payment.conversationId,
            type: "meta_capi_purchase",
            data: { paymentId: payment.id, pixelId: id, eventsReceived: (result as { events_received?: number }).events_received ?? null },
          },
        });
      } catch (e) {
        console.error("[meta-capi] Purchase falhou", id, e instanceof Error ? e.message : e);
      }
    }),
  );
}
