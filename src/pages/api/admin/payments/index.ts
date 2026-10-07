import type { PaymentStatus } from "@prisma/client";
import { apiHandler, queryString, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { activeProviderName, sandboxAllowed } from "@/services/payments";

const STATUSES: PaymentStatus[] = ["CREATED", "PENDING", "APPROVED", "FAILED", "REFUNDED"];

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const status = queryString(req.query.status) as PaymentStatus | undefined;
    const page = Math.max(1, Number(queryString(req.query.page) ?? 1) || 1);
    const where = status && STATUSES.includes(status) ? { status } : {};
    const [payments, totals] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * 50,
        take: 50,
        include: {
          product: { select: { name: true } },
          funnel: { select: { name: true } },
          lead: { select: { id: true, name: true, utmCampaign: true } },
        },
      }),
      prisma.payment.groupBy({ by: ["status", "currency"], _count: true, _sum: { amount: true } }),
    ]);
    return {
      provider: activeProviderName(),
      sandbox: activeProviderName() === "sandbox" && sandboxAllowed(),
      // totais por moeda (reais e pesos não se somam)
      totals: Object.fromEntries(totals.filter((t) => t.currency !== "MXN").map((t) => [t.status, { count: t._count, amount: t._sum.amount ?? 0 }])),
      totalsMXN: Object.fromEntries(totals.filter((t) => t.currency === "MXN").map((t) => [t.status, { count: t._count, amount: t._sum.amount ?? 0 }])),
      payments: payments.map((p) => ({
        id: p.id,
        status: p.status,
        method: p.method,
        amount: p.amount,
        currency: p.currency,
        provider: p.provider,
        providerPaymentId: p.providerPaymentId,
        product: p.product.name,
        funnel: p.funnel?.name ?? "—",
        lead: p.lead,
        customerName: p.customerName,
        customerEmail: p.customerEmail,
        createdAt: p.createdAt,
        approvedAt: p.approvedAt,
      })),
    };
  },
});
