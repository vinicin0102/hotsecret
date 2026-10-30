// Chamada de vídeo: devolve o vídeo e a linha do tempo (FREE/VIP/falas/upsells) quando o lead atende.
import { z } from "zod";
import { apiHandler, HttpError, leadRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes, getFunnelSettings } from "@/services/funnels";
import { asCurrency, currencyOfLocale } from "@/lib/format";
import { normalizeTimeline } from "@/types/video";
import type { AiContent, OfferContent } from "@/types/flow";
import { brainOffers, brainVoiceCalls, voiceCallProductId } from "@/services/ai/brain";
import { vipAccessUrl, vipPreviewCard, type VipPreviewCard } from "@/services/vip";
import { publicMarker, whatsappDigits } from "@/lib/whatsapp";

const schema = z.object({
  token: z.string().min(10).max(2000),
  nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/),
  /** bloco Cérebro: produto da oferta em chamada */
  productId: z.string().max(64).optional(),
});

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "call", 30, 60_000);
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
      const offers = brain ? brainOffers(brain) : [];
      const withVideo = offers.filter((o) => (o.style === "call" || o.style === "live" || o.style === "combo") && o.videoId);
      // vídeo escolhido na ligação de voz para o produto vendido no fim dela
      const voice = brain && productId ? brainVoiceCalls(brain).find((v) => v.videoId && voiceCallProductId(v, offers) === productId) : undefined;
      videoId = voice?.videoId ?? withVideo.find((o) => o.productId === productId || o.downsellProductId === productId)?.videoId;
      if (!videoId && productId && withVideo.length) {
        // ingresso comprado numa "Oferta" marcada no vídeo: a chamada é a desse vídeo
        const vids = await prisma.video.findMany({ where: { id: { in: withVideo.map((o) => o.videoId!) } } });
        videoId = vids.find((v) =>
          ((v.timeline as { markers?: { productId?: string; basicProductId?: string }[] } | null)?.markers ?? []).some(
            (m) => m.productId === productId || m.basicProductId === productId,
          ),
        )?.id;
      }
    }
    const video = videoId ? await prisma.video.findUnique({ where: { id: videoId } }) : null;
    if (!video) return { video: null };
    const timeline = normalizeTimeline(video.timeline, video.durationMs);
    // upsell "Grupo VIP": a prévia do grupo (só publicado) e o link do grupo já como este lead
    const vipIds = [...new Set(timeline.markers.flatMap((m) => (m.style === "vip" && m.vipGroupId ? [m.vipGroupId] : [])))];
    const vipCards = new Map(
      (await Promise.all(vipIds.map(async (gid) => [gid, await vipPreviewCard(gid)] as const))).filter((e): e is [string, VipPreviewCard] => !!e[1]),
    );
    const vipUrls = new Map(await Promise.all([...vipCards.values()].map(async (c) => [c.groupId, await vipAccessUrl({ id: c.groupId, slug: c.slug }, session.leadId)] as const)));
    const ids = [...new Set(timeline.markers.flatMap((m) => [m.productId, m.basicProductId ?? ""]).filter(Boolean))];
    const [products, funnel] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: ids }, active: true } }),
      prisma.funnel.findUnique({ where: { id: session.funnelId }, select: { settings: true } }),
    ]);
    // só produtos na moeda do país do fluxo (fluxo do Brasil = reais/PIX): upsell de outra moeda não aparece
    const flowCurrency = currencyOfLocale(getFunnelSettings(funnel?.settings).locale);
    const byId = new Map(products.filter((p) => asCurrency(p.currency) === flowCurrency).map((p) => [p.id, p]));
    return {
      video: {
        url: video.url,
        posterUrl: video.posterUrl,
        durationMs: video.durationMs,
        free: timeline.free,
        vip: timeline.vip,
        chat: timeline.chat,
        frame: timeline.frame ?? null,
        markers: timeline.markers
          .filter(
            (m) =>
              byId.has(m.productId) &&
              (m.style !== "vip" || (!!m.vipGroupId && vipCards.has(m.vipGroupId))) &&
              // WhatsApp pessoal sem número válido não aparece (não teria o que entregar)
              (m.style !== "whatsapp" || !!whatsappDigits(m.whatsapp?.phone)),
          )
          .map((m) => {
            const p = byId.get(m.productId)!;
            const b = m.basicProductId ? byId.get(m.basicProductId) : undefined;
            return {
              // o número do upsell "WhatsApp pessoal" só sai depois do pagamento (/api/public/delivery)
              ...publicMarker(m),
              product: { id: p.id, name: p.name, price: p.price, originalPrice: p.originalPrice, currency: p.currency },
              ...(b ? { basicProduct: { id: b.id, name: b.name, price: b.price, originalPrice: b.originalPrice, currency: b.currency } } : {}),
              ...(m.style === "vip" && m.vipGroupId ? { vipCard: vipCards.get(m.vipGroupId), vipUrl: vipUrls.get(m.vipGroupId) } : {}),
            };
          }),
      },
    };
  },
});
