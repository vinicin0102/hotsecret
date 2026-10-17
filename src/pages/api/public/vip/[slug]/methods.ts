// Grupo VIP: métodos de pagamento do produto no gateway (pesos), com os campos que o comprador preenche.
import { z } from "zod";
import { apiHandler, HttpError, leadRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { asCurrency } from "@/lib/format";
import { providerNameForCurrency } from "@/services/payments/index";
import { publicZenithMethod, zenithMethodsFor } from "@/services/payments/zenith-checkout";
import { adminPreview, findGroup, requireVipSession, sellableProducts } from "@/services/vip";

const schema = z.object({ token: z.string().min(10).max(2000), productId: z.string().min(1).max(64) });

export default apiHandler({
  POST: async (req) => {
    leadRateLimit(req, "vip-methods", 30, 60_000);
    const body = schema.parse(req.body);
    const group = await findGroup(String(req.query.slug), await adminPreview(req));
    const session = await requireVipSession(body.token, group);
    const product = (await sellableProducts(group)).get(body.productId);
    if (!product) throw new HttpError(404, "Producto no disponible");
    if (providerNameForCurrency(asCurrency(product.currency)) !== "zenith") return { methods: null };
    const methods = await zenithMethodsFor(product);
    const lead = await prisma.lead.findUnique({ where: { id: session.leadId }, select: { name: true, email: true } });
    return { methods: methods.map(publicZenithMethod), prefill: { name: lead?.name ?? undefined, email: lead?.email ?? undefined } };
  },
});
