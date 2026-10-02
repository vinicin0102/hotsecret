// Consulta periódica do chat: status dos pagamentos + mensagens geradas pelo servidor
// (confirmação de pagamento, recuperação de checkout).
import { z } from "zod";
import { apiHandler, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession, publicMessage } from "@/services/conversation";
import { publicPayment, syncPaymentWithProvider } from "@/services/payments/service";
import { checkRecoveryFor } from "@/services/recovery";

const schema = z.object({ token: z.string().min(10).max(2000), since: z.string().max(40).optional() });

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "state", 120, 60_000);
    const body = schema.parse(req.body);
    const session = await requireLeadSession(body.token);
    await checkRecoveryFor(session.conversationId);

    const payments = await prisma.payment.findMany({
      where: { conversationId: session.conversationId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const synced = await Promise.all(
      payments.map((p) => (p.status === "PENDING" || p.status === "CREATED" ? syncPaymentWithProvider(p) : p)),
    );

    const since = body.since ? new Date(body.since) : new Date(Date.now() - 60_000);
    const messages = await prisma.message.findMany({
      where: {
        conversationId: session.conversationId,
        type: { in: ["recovery", "payment_update"] },
        createdAt: { gt: Number.isNaN(since.getTime()) ? new Date(0) : since },
      },
      orderBy: { createdAt: "asc" },
    });
    return { payments: synced.map(publicPayment), messages: messages.map(publicMessage), serverTime: new Date().toISOString() };
  },
});
