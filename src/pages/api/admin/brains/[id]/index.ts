import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { brainSchema } from "@/lib/validation";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const brain = await prisma.brain.findUnique({ where: { id: String(req.query.id) } });
    if (!brain) throw new HttpError(404, "Cérebro não encontrado");
    return { brain };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const brain = await prisma.brain.update({ where: { id: String(req.query.id) }, data: brainSchema.parse(req.body) });
    return { brain };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.brain.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
