import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { productSchema } from "@/lib/validation";

export default apiHandler({
  PUT: async (req) => {
    await requireAdmin(req);
    const product = await prisma.product.update({ where: { id: String(req.query.id) }, data: productSchema.parse(req.body) });
    return { product };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    const id = String(req.query.id);
    if (await prisma.payment.count({ where: { productId: id } })) {
      throw new HttpError(409, "Produto possui pagamentos. Desative-o em vez de excluir.");
    }
    await prisma.product.delete({ where: { id } });
    return { ok: true };
  },
});
