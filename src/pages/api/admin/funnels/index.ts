import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { funnelMetaSchema } from "@/lib/validation";
import { funnelSummaries } from "@/services/analytics";
import { saveGraph, starterGraph } from "@/services/funnels";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const [funnels, stats] = await Promise.all([
      prisma.funnel.findMany({
        orderBy: { updatedAt: "desc" },
        include: { character: { select: { name: true, avatarUrl: true } }, _count: { select: { nodes: true } } },
      }),
      funnelSummaries(),
    ]);
    return {
      funnels: funnels.map((f) => {
        const s = stats[f.id] ?? { visitors: 0, sales: 0 };
        return { ...f, stats: { ...s, conversion: s.visitors ? s.sales / s.visitors : 0 } };
      }),
    };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const data = funnelMetaSchema.parse(req.body);
    const funnel = await prisma.funnel.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        slug: data.slug,
        characterId: data.characterId || null,
        initialMessage: data.initialMessage ?? null,
        status: data.status ?? "DRAFT",
        settings: data.settings ?? {},
      },
    });
    await saveGraph(funnel.id, starterGraph(data.initialMessage));
    return { funnel };
  },
});
