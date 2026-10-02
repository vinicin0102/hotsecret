// Entrega do produto: o link de acesso só é revelado se existir pagamento APROVADO para o lead.
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";

const schema = z.object({ token: z.string().min(10).max(2000), productId: z.string().max(64).optional().nullable() });

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "delivery", 30, 60_000);
    const body = schema.parse(req.body);
    const session = await requireLeadSession(body.token);
    const payment = await prisma.payment.findFirst({
      where: { leadId: session.leadId, status: "APPROVED", ...(body.productId ? { productId: body.productId } : {}) },
      include: { product: true },
      orderBy: { approvedAt: "desc" },
    });
    if (!payment) throw new HttpError(402, "Pagamento ainda não confirmado");
    return { productName: payment.product.name, url: payment.product.deliveryUrl };
  },
});
