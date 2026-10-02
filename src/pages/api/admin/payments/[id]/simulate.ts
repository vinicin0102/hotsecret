// Ambiente de teste: dispara um webhook ASSINADO do provedor sandbox (mesmo caminho de produção).
import { z } from "zod";
import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sandboxAllowed } from "@/services/payments";
import { simulateSandboxWebhook } from "@/services/payments/sandbox";

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    if (!sandboxAllowed()) throw new HttpError(404, "Indisponível em produção");
    const { status } = z.object({ status: z.enum(["APPROVED", "FAILED", "REFUNDED"]) }).parse(req.body);
    const payment = await prisma.payment.findUnique({ where: { id: String(req.query.id) } });
    if (!payment || payment.provider !== "sandbox" || !payment.providerPaymentId) throw new HttpError(400, "Apenas pagamentos sandbox");
    const out = await simulateSandboxWebhook(payment.providerPaymentId, status);
    return out.body;
  },
});
