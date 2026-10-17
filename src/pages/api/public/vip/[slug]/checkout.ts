// Grupo VIP: gera o pagamento da assinatura ou de um post pago à parte (PIX; pesos: gateway próprio).
import { z } from "zod";
import { apiHandler, leadRateLimit } from "@/lib/api";
import { payerSchema } from "@/lib/validation";
import { adminPreview, findGroup, requireVipSession, vipCheckout } from "@/services/vip";

const schema = z.object({ token: z.string().min(10).max(2000), productId: z.string().min(1).max(64), payer: payerSchema.optional() });

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "vip-checkout", 15, 60_000);
    const body = schema.parse(req.body);
    const group = await findGroup(String(req.query.slug), await adminPreview(req));
    const session = await requireVipSession(body.token, group);
    return { payment: await vipCheckout(group, session, body.productId, body.payer) };
  },
});
