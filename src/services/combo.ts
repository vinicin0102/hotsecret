// Entrega do "WhatsApp pessoal" e do Combo do Cérebro depois do pagamento aprovado.
// O número e os itens vêm de onde a compra aconteceu (o Cérebro do bloco/canal WhatsApp e os vídeos dele):
// com várias modelos vendendo o mesmo produto, cada lead recebe o número da conversa em que comprou.
import type { Brain, Payment, Product } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { whatsappLinkForOffer, whatsappLinkForProduct } from "@/lib/whatsapp";
import { brainOffers, brainVoiceCalls, type BrainOffer } from "@/services/ai/brain";
import { vipAccessUrl, withVipAccess } from "@/services/vip";
import { getWhatsAppSettings } from "@/services/whatsapp/settings";
import type { UpsellMarker } from "@/types/video";

/** bloco do canal WhatsApp (o mesmo id do bot) */
const WA_NODE = "whatsapp";

type PaymentRef = Pick<Payment, "funnelId" | "offerNodeId" | "productId">;

/** Cérebro em que a compra aconteceu: o do bloco de IA do fluxo ou o que responde no canal WhatsApp */
async function purchaseBrainId(payment: PaymentRef): Promise<string | undefined> {
  if (payment.offerNodeId === WA_NODE) return (await getWhatsAppSettings()).brainId || undefined;
  if (!payment.funnelId || !payment.offerNodeId) return undefined;
  const node = await prisma.funnelNode.findUnique({ where: { funnelId_id: { funnelId: payment.funnelId, id: payment.offerNodeId } } });
  return node?.type === "ai" ? (node.content as { brainId?: string }).brainId : undefined;
}

/** vídeo da chamada do bloco de oferta em que a compra aconteceu */
async function purchaseVideoId(payment: PaymentRef): Promise<string | undefined> {
  if (!payment.funnelId || !payment.offerNodeId || payment.offerNodeId === WA_NODE) return undefined;
  const node = await prisma.funnelNode.findUnique({ where: { funnelId_id: { funnelId: payment.funnelId, id: payment.offerNodeId } } });
  return node?.type === "offer" ? (node.content as { videoId?: string }).videoId : undefined;
}

/**
 * Combos e upsells "WhatsApp pessoal" que vendem o produto pago. own = os da conversa em que ele comprou;
 * any = os de todos os Cérebros/vídeos (usados só quando a conversa não tem nenhum).
 */
export async function purchaseSources(payment: PaymentRef) {
  const [brainId, offerVideoId, brains] = await Promise.all([
    purchaseBrainId(payment),
    purchaseVideoId(payment),
    prisma.brain.findMany({ select: { id: true, offers: true, voiceCalls: true } }),
  ]);
  const own = brains.find((b) => b.id === brainId);
  const sells = (b: Pick<Brain, "offers">) => brainOffers(b).filter((o) => o.style === "combo" && o.productId === payment.productId);
  const ownCombos = own ? sells(own) : [];
  const combos = ownCombos.length ? ownCombos : brains.flatMap(sells);

  // vídeos da conversa: o do bloco de oferta e os das chamadas/ligações do Cérebro
  const ownVideoIds = new Set(
    [
      offerVideoId,
      ...(own ? brainOffers(own).map((o) => o.videoId) : []),
      ...(own ? brainVoiceCalls(own as Brain).map((v) => v.videoId) : []),
    ].filter((v): v is string => !!v),
  );
  const videos = await prisma.video.findMany({ select: { id: true, timeline: true } });
  const markersOf = (v: { timeline: unknown }) =>
    ((v.timeline as { markers?: UpsellMarker[] } | null)?.markers ?? []).filter((m) => m.style === "whatsapp" && m.productId === payment.productId);
  const ownMarkers = videos.filter((v) => ownVideoIds.has(v.id)).flatMap(markersOf);
  return { combos, ownCombos: ownCombos.length > 0, markers: ownMarkers.length ? ownMarkers : videos.flatMap(markersOf), ownMarkers: ownMarkers.length > 0 };
}

export interface Delivered {
  productName: string;
  url: string | null;
  /** link da conversa no WhatsApp */
  whatsapp?: string;
  /** Grupo VIP do combo, já liberado para este lead */
  vipUrl?: string;
  /** link de acesso do produto pago */
  accessUrl?: string;
  /** produtos incluídos no combo (url null: entregue no próprio chat) */
  items?: { name: string; url: string | null }[];
}

/** acesso de um produto: o Grupo VIP que ele assina, ou o link de acesso (com o acesso do lead se for de um grupo) */
async function productAccess(product: Pick<Product, "id" | "deliveryUrl">, leadId: string): Promise<string | null> {
  if (product.deliveryUrl) return withVipAccess(product.deliveryUrl, leadId);
  const group = await prisma.vipGroup.findFirst({ where: { productId: product.id, published: true }, select: { id: true, slug: true } });
  return group ? vipAccessUrl(group, leadId) : null;
}

/** o que o lead recebe depois do pagamento aprovado */
export async function deliveryFor(payment: Payment & { product: Product }, leadId: string): Promise<Delivered> {
  const productName = payment.product.name;
  const accessUrl = (await withVipAccess(payment.product.deliveryUrl, leadId)) ?? undefined;
  const { combos, markers, ownMarkers } = await purchaseSources(payment);

  if (combos.length) {
    const combo: BrainOffer = combos.find((o) => o.whatsapp?.phone) ?? combos[0];
    const whatsapp = whatsappLinkForOffer([combo], payment.productId, payment.currency) ?? undefined;
    const group = combo.vipGroupId
      ? await prisma.vipGroup.findUnique({ where: { id: combo.vipGroupId }, select: { id: true, slug: true, published: true } })
      : null;
    const vipUrl = group?.published ? await vipAccessUrl(group, leadId) : undefined;
    const ids = (combo.comboProductIds ?? []).filter((id) => id !== payment.productId);
    const included = ids.length ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, deliveryUrl: true } }) : [];
    const items = await Promise.all(
      ids.flatMap((id) => included.filter((p) => p.id === id)).map(async (p) => ({ name: p.name, url: await productAccess(p, leadId) })),
    );
    return {
      productName,
      url: whatsapp ?? vipUrl ?? accessUrl ?? items.find((i) => i.url)?.url ?? null,
      ...(whatsapp ? { whatsapp } : {}),
      ...(vipUrl ? { vipUrl } : {}),
      ...(accessUrl ? { accessUrl } : {}),
      ...(items.length ? { items } : {}),
    };
  }
  // upsell "WhatsApp pessoal" do editor de vídeo: o da chamada em que ele comprou vale mesmo com link de acesso no produto
  if (ownMarkers || !accessUrl) {
    const whatsapp = whatsappLinkForProduct(markers, payment.productId, payment.currency);
    if (whatsapp) return { productName, url: whatsapp, whatsapp, ...(accessUrl ? { accessUrl } : {}) };
  }
  return { productName, url: accessUrl ?? null };
}
