import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { funnelMetaSchema } from "@/lib/validation";
import { funnelSummaries } from "@/services/analytics";
import { heavyAdminQuery } from "@/lib/admin-query";
import { saveGraph, starterGraph } from "@/services/funnels";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const [funnels, stats] = await Promise.all([
      prisma.funnel.findMany({
        orderBy: { updatedAt: "desc" },
        include: { character: { select: { name: true, avatarUrl: true } }, _count: { select: { nodes: true } } },
      }),
      // estatísticas dos últimos 30 dias, guardadas 5 min; se estourar o tempo, a lista abre sem os números
      heavyAdminQuery("funnel-summaries", 300_000, (db) => funnelSummaries(undefined, db)).catch((e) => {
        console.error("[admin] estatísticas dos fluxos indisponíveis", e instanceof Error ? e.message.slice(0, 200) : e);
        return {} as Awaited<ReturnType<typeof funnelSummaries>>;
      }),
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
