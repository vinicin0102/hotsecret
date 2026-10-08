// Métodos de pagamento do produto, consultados no catálogo do gateway em tempo real (Zenith),
// com os campos que o comprador precisa preencher. Nada de credencial ou dado interno sai daqui.
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { asCurrency } from "@/lib/format";
import { requireLeadSession } from "@/services/conversation";
import { providerNameForCurrency } from "@/services/payments/index";
import { publicZenithMethod, zenithMethodsFor } from "@/services/payments/zenith-checkout";

const schema = z.object({ token: z.string().min(10).max(2000), productId: z.string().min(1).max(64) });

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "payment-methods", 30, 60_000);
    const body = schema.parse(req.body);
    const session = await requireLeadSession(body.token);
    const product = await prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || !product.active) throw new HttpError(404, "Producto no disponible");
    if (providerNameForCurrency(asCurrency(product.currency)) !== "zenith") return { methods: null };
    const methods = await zenithMethodsFor(product);
    // nome/e-mail que o próprio lead já informou (pergunta do fluxo ou compra anterior) vêm preenchidos
    const lead = await prisma.lead.findUnique({ where: { id: session.leadId }, select: { name: true, email: true } });
    return { methods: methods.map(publicZenithMethod), prefill: { name: lead?.name ?? undefined, email: lead?.email ?? undefined } };
  },
});
