import { apiHandler, getClientIp, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { checkoutSchema } from "@/lib/validation";
import { requireLeadSession } from "@/services/conversation";
import { createCheckout, publicPayment } from "@/services/payments/service";

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "checkout", 10, 60_000);
    const body = checkoutSchema.parse(req.body);
    const session = await requireLeadSession(body.token);
    // dispositivo e cookies do pixel no momento da compra (melhoram a correspondência da API de Conversões)
    await prisma.lead.update({
      where: { id: session.leadId },
      data: {
        clientIp: getClientIp(req).slice(0, 64),
        userAgent: String(req.headers["user-agent"] ?? "").slice(0, 400) || null,
        ...(body.fbp ? { fbp: body.fbp } : {}),
        ...(body.fbc ? { fbc: body.fbc } : {}),
      },
    });
    const payment = await createCheckout(session, body);
    return { payment: publicPayment(payment) };
  },
});
