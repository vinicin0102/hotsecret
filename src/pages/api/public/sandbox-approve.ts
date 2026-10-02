// SOMENTE AMBIENTE DE TESTE: simula a confirmação do gateway sandbox pelo próprio chat.
// Desativado em produção (a menos que ALLOW_SANDBOX_PAYMENTS=true) e só vale para pagamentos "sandbox".
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireLeadSession } from "@/services/conversation";
import { publicPayment } from "@/services/payments/service";
import { simulateSandboxWebhook } from "@/services/payments/sandbox";
import { sandboxAllowed } from "@/services/payments";

const schema = z.object({
  token: z.string().min(10).max(2000),
  paymentId: z.string().max(64),
  status: z.enum(["APPROVED", "FAILED"]),
});

export default apiHandler({
  POST: async (req) => {
    if (!sandboxAllowed()) throw new HttpError(404, "Não encontrado");
    rateLimit(req, "sandbox", 20, 60_000);
    const body = schema.parse(req.body);
    const session = await requireLeadSession(body.token);
    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment || payment.leadId !== session.leadId || payment.provider !== "sandbox" || !payment.providerPaymentId) {
      throw new HttpError(404, "Pagamento não encontrado");
    }
    await simulateSandboxWebhook(payment.providerPaymentId, body.status);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    return { payment: updated ? publicPayment(updated) : null };
  },
});
