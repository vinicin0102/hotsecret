// Chamada de vídeo: devolve o vídeo e a linha do tempo (FREE/VIP/falas/upsells) quando o lead atende.
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";
import { normalizeTimeline } from "@/types/video";
import type { OfferContent } from "@/types/flow";

const schema = z.object({ token: z.string().min(10).max(2000), nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/) });

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "call", 30, 60_000);
    const { token, nodeId } = schema.parse(req.body);
    const session = await requireLeadSession(token);
    const { graph, locked, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "offer") throw new HttpError(404, "Chamada não encontrada");
    if (locked.has(node.id) && !unlocked.has(node.id)) throw new HttpError(403, "Conteúdo bloqueado");
    const c = node.content as OfferContent;
    const video = c.videoId ? await prisma.video.findUnique({ where: { id: c.videoId } }) : null;
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
            return { ...m, product: { id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice } };
          }),
      },
    };
  },
});
