import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { funnelMetaSchema } from "@/lib/validation";
import { loadGraph } from "@/services/funnels";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const id = String(req.query.id);
    const funnel = await prisma.funnel.findUnique({ where: { id }, include: { character: true } });
    if (!funnel) throw new HttpError(404, "Fluxo não encontrado");
    return { funnel, graph: await loadGraph(id) };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const data = funnelMetaSchema.parse(req.body);
    const funnel = await prisma.funnel.update({
      where: { id: String(req.query.id) },
      data: {
        name: data.name,
        description: data.description ?? null,
        slug: data.slug,
        characterId: data.characterId || null,
        initialMessage: data.initialMessage ?? null,
        ...(data.status ? { status: data.status } : {}),
        ...(data.settings ? { settings: data.settings } : {}),
      },
    });
    return { funnel };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.funnel.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
