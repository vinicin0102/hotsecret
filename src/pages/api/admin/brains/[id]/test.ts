// Conversa de teste com o cérebro (painel e preview do fluxo). Nada é gravado.
import { z } from "zod";
import { apiHandler, HttpError, rateLimit, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { describeAiError, publicOfferFormat, runBrain, type FlowOfferInfo } from "@/services/ai/brain";

export const config = { maxDuration: 60 };

const schema = z.object({
  history: z.array(z.object({ role: z.enum(["lead", "bot"]), text: z.string().max(2000) })).max(60),
  goal: z.string().max(2000).optional(),
  /** preview do fluxo: ofertas ligadas na saída "Mostrar botões de oferta" */
  flowOffers: z
    .array(z.object({ productId: z.string().max(64), headline: z.string().max(200).optional(), button: z.string().max(200).optional() }))
    .max(20)
    .optional(),
});

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req, "VIEWER");
    rateLimit(req, "ai-brain-test", 30, 60_000);
    const { history, goal, flowOffers: flowList } = schema.parse(req.body);
    const brain = await prisma.brain.findUnique({ where: { id: String(req.query.id) } });
    if (!brain) throw new HttpError(404, "Cérebro não encontrado");
    try {
      let flowOffers: FlowOfferInfo[] | undefined;
      if (flowList) {
        const prods = await prisma.product.findMany({ where: { id: { in: flowList.map((o) => o.productId) }, active: true } });
        flowOffers = flowList
          .map((o): FlowOfferInfo | null => {
            const p = prods.find((x) => x.id === o.productId);
            return p ? { name: o.headline || p.name, price: p.price, originalPrice: p.originalPrice, description: p.description, button: o.button } : null;
          })
          .filter((v): v is FlowOfferInfo => !!v);
      }
      const r = await runBrain({ brain, history, goal, flowOffers });
      return {
        messages: r.messages,
        audio: r.audio,
        image: r.image,
        end: r.end,
        showOffers: !!r.showOffers,
        offer: r.offer && {
          id: r.offer.id,
          productId: r.offer.productId,
          name: r.offer.product.name,
          price: r.offer.product.price,
          headline: r.offer.headline || r.offer.product.name,
          ctaLabel: r.offer.ctaLabel,
          ...publicOfferFormat(r.offer),
          downsellProductId: r.offer.downsellProductId || undefined,
          downsellText: r.offer.downsellText || undefined,
        },
        usage: r.usage,
        failure: r.failure,
      };
    } catch (e) {
      throw new HttpError(502, describeAiError(e));
    }
  },
});
