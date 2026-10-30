// Entrega do produto: o link de acesso só é revelado se existir pagamento APROVADO para o lead.
import { z } from "zod";
import { apiHandler, HttpError, leadRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { vipAccessUrl, withVipAccess } from "@/services/vip";
import { whatsappLinkForOffer, whatsappLinkForProduct } from "@/lib/whatsapp";
import { brainOffers } from "@/services/ai/brain";
import type { UpsellMarker } from "@/types/video";

const schema = z.object({ token: z.string().min(10).max(2000), productId: z.string().max(64).optional().nullable() });

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "delivery", 30, 60_000);
    const body = schema.parse(req.body);
    const session = await requireLeadSession(body.token);
    const payment = await prisma.payment.findFirst({
      where: { leadId: session.leadId, status: "APPROVED", ...(body.productId ? { productId: body.productId } : {}) },
      include: { product: true },
      orderBy: { approvedAt: "desc" },
    });
    if (!payment) throw new HttpError(402, "Pagamento ainda não confirmado");
    const deliveryUrl = await withVipAccess(payment.product.deliveryUrl, session.leadId);
    // combo do Cérebro: o número do WhatsApp, o Grupo VIP e o link do produto (a chamada sai pelo /api/public/call)
    const brains = await prisma.brain.findMany({ select: { offers: true } });
    const combos = brains.flatMap(brainOffers).filter((o) => o.style === "combo" && o.productId === payment.productId);
    if (combos.length) {
      const wa = whatsappLinkForOffer(combos, payment.productId) ?? undefined;
      const groupId = combos.find((o) => o.vipGroupId)?.vipGroupId;
      const group = groupId ? await prisma.vipGroup.findUnique({ where: { id: groupId }, select: { id: true, slug: true, published: true } }) : null;
      const vipUrl = group?.published ? await vipAccessUrl(group, session.leadId) : undefined;
      return {
        productName: payment.product.name,
        url: wa ?? vipUrl ?? deliveryUrl,
        ...(wa ? { whatsapp: wa } : {}),
        ...(vipUrl ? { vipUrl } : {}),
        ...(deliveryUrl ? { accessUrl: deliveryUrl } : {}),
      };
    }
    // sem link no produto: o número do upsell "WhatsApp pessoal" (editor de vídeo) que vendeu este produto
    if (!deliveryUrl) {
      const videos = await prisma.video.findMany({ select: { timeline: true } });
      const markers = videos.flatMap((v) => (v.timeline as { markers?: UpsellMarker[] } | null)?.markers ?? []);
      const link = whatsappLinkForProduct(markers, payment.productId);
      if (link) return { productName: payment.product.name, url: link, whatsapp: link };
    }
    // link de um Grupo VIP: o comprador entra já liberado (o mesmo lead)
    return { productName: payment.product.name, url: deliveryUrl };
  },
});
