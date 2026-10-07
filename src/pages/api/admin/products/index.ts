import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { adminProduct, productData } from "@/services/products";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const products = await prisma.product.findMany({ orderBy: { createdAt: "desc" } });
    const sales = await prisma.payment.groupBy({
      by: ["productId"],
      where: { status: "APPROVED" },
      _count: true,
      _sum: { amount: true },
    });
    const byId = Object.fromEntries(sales.map((s) => [s.productId, { sales: s._count, revenue: s._sum.amount ?? 0 }]));
    return { products: products.map((p) => ({ ...adminProduct(p), stats: byId[p.id] ?? { sales: 0, revenue: 0 } })) };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const product = await prisma.product.create({ data: productData(req.body) });
    return { product: adminProduct(product) };
  },
});
