// Conversa de teste com o cérebro (painel e preview do fluxo). Nada é gravado.
import { z } from "zod";
import { apiHandler, HttpError, rateLimit, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { describeAiError, runBrain } from "@/services/ai/brain";

export const config = { maxDuration: 60 };

const schema = z.object({
  history: z.array(z.object({ role: z.enum(["lead", "bot"]), text: z.string().max(2000) })).max(60),
  goal: z.string().max(2000).optional(),
});

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req, "VIEWER");
    rateLimit(req, "ai-brain-test", 30, 60_000);
    const { history, goal } = schema.parse(req.body);
    const brain = await prisma.brain.findUnique({ where: { id: String(req.query.id) } });
    if (!brain) throw new HttpError(404, "Cérebro não encontrado");
    try {
      const r = await runBrain({ brain, history, goal });
      return {
        messages: r.messages,
        audio: r.audio,
        image: r.image,
        end: r.end,
        offer: r.offer && {
          id: r.offer.id,
          productId: r.offer.productId,
          name: r.offer.product.name,
          price: r.offer.product.price,
          headline: r.offer.headline || r.offer.product.name,
          ctaLabel: r.offer.ctaLabel,
          style: r.offer.style === "call" && r.offer.videoId ? "call" : "card",
          downsellProductId: r.offer.downsellProductId || undefined,
          downsellText: r.offer.downsellText || undefined,
        },
        usage: r.usage,
      };
    } catch (e) {
      throw new HttpError(502, describeAiError(e));
    }
  },
});
