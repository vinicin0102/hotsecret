// Chamada de vídeo: devolve o vídeo e a linha do tempo (FREE/VIP/falas/upsells) quando o lead atende.
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";
import { normalizeTimeline } from "@/types/video";
import type { AiContent, OfferContent } from "@/types/flow";
import { brainOffers } from "@/services/ai/brain";

const schema = z.object({
  token: z.string().min(10).max(2000),
  nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/),
  /** bloco Cérebro: produto da oferta em chamada */
  productId: z.string().max(64).optional(),
});

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "call", 30, 60_000);
    const { token, nodeId, productId } = schema.parse(req.body);
    const session = await requireLeadSession(token);
    const { graph, locked, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || (node.type !== "offer" && node.type !== "ai")) throw new HttpError(404, "Chamada não encontrada");
    if (locked.has(node.id) && !unlocked.has(node.id)) throw new HttpError(403, "Conteúdo bloqueado");
    let videoId = (node.content as OfferContent).videoId;
    if (node.type === "ai") {
      const brainId = (node.content as AiContent).brainId;
      const brain = brainId ? await prisma.brain.findUnique({ where: { id: brainId } }) : null;
      videoId = brain
        ? brainOffers(brain).find((o) => (o.productId === productId || o.downsellProductId === productId) && (o.style === "call" || o.style === "live"))?.videoId
        : undefined;
    }
    const video = videoId ? await prisma.video.findUnique({ where: { id: videoId } }) : null;
    if (!video) return { video: null };
    const timeline = normalizeTimeline(video.timeline, video.durationMs);
    const ids = [...new Set(timeline.markers.map((m) => m.productId).filter(Boolean))];
    const products = await prisma.product.findMany({ where: { id: { in: ids }, active: true } });
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      video: {
        url: video.url,
        posterUrl: video.posterUrl,
        durationMs: video.durationMs,
        free: timeline.free,
        vip: timeline.vip,
        chat: timeline.chat,
        markers: timeline.markers
          .filter((m) => byId.has(m.productId))
          .map((m) => {
            const p = byId.get(m.productId)!;
            return { ...m, product: { id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice, currency: p.currency } };
          }),
      },
    };
  },
});
