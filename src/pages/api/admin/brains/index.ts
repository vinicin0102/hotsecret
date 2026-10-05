import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { brainSchema } from "@/lib/validation";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const brains = await prisma.brain.findMany({ orderBy: { createdAt: "asc" } });
    return { brains };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const brain = await prisma.brain.create({ data: brainSchema.parse(req.body) });
    return { brain };
  },
});
