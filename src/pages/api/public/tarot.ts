// Oferta de tarot do Cérebro: devolve as cartas (nome, imagem e leitura) só depois do pagamento aprovado.
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";
import { brainOffers, tarotCardsOf } from "@/services/ai/brain";
import type { AiContent } from "@/types/flow";

const schema = z.object({
  token: z.string().min(10).max(2000),
  nodeId: z.string().regex(/^[a-zA-Z0-9_:-]{1,64}$/),
  /** bloco Cérebro: produto da oferta de tarot */
  productId: z.string().max(64).optional(),
});

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "tarot", 30, 60_000);
    const { token, nodeId, productId } = schema.parse(req.body);
    const session = await requireLeadSession(token);
    const { graph, locked, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node || node.type !== "ai") throw new HttpError(404, "Cartas não encontradas");
    if (locked.has(node.id) && !unlocked.has(node.id)) throw new HttpError(403, "Conteúdo bloqueado");

    const brainId = (node.content as AiContent).brainId;
    const brain = brainId && productId ? await prisma.brain.findUnique({ where: { id: brainId } }) : null;
    const offer = brain ? brainOffers(brain).find((o) => o.productId === productId && o.style === "tarot") : undefined;
    const cards = offer ? tarotCardsOf(offer) : [];
    if (!offer || !cards.length) throw new HttpError(404, "Cartas não encontradas");

    const paid = await prisma.payment.findFirst({
      where: { leadId: session.leadId, funnelId: session.funnelId, offerNodeId: nodeId, productId: offer.productId, status: "APPROVED" },
      select: { id: true },
    });
    if (!paid) return { cards: null };
    return { cards: cards.map((c) => ({ id: c.id, label: c.label, name: c.name, imageUrl: c.imageUrl, meaning: c.meaning })) };
  },
});
