// SOMENTE AMBIENTE DE TESTE: simula a confirmação do gateway sandbox na página do Grupo VIP.
import { z } from "zod";
import { apiHandler, HttpError, leadRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { publicPayment } from "@/services/payments/service";
import { simulateSandboxWebhook } from "@/services/payments/sandbox";
import { sandboxAllowed } from "@/services/payments";
import { adminPreview, findGroup, requireVipSession } from "@/services/vip";

const schema = z.object({ token: z.string().min(10).max(2000), paymentId: z.string().max(64), status: z.enum(["APPROVED", "FAILED"]) });

export default apiHandler({
  POST: async (req) => {
    if (!sandboxAllowed()) throw new HttpError(404, "Não encontrado");
    leadRateLimit(req, "vip-sandbox", 20, 60_000);
    const body = schema.parse(req.body);
    const group = await findGroup(String(req.query.slug), await adminPreview(req));
    const session = await requireVipSession(body.token, group);
    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!payment || payment.leadId !== session.leadId || payment.provider !== "sandbox" || !payment.providerPaymentId) throw new HttpError(404, "Pagamento não encontrado");
    await simulateSandboxWebhook(payment.providerPaymentId, body.status);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    return { payment: updated ? publicPayment(updated) : null };
  },
});
