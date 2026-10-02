import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { characterSchema } from "@/lib/validation";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const characters = await prisma.character.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { funnels: true } } },
    });
    return { characters };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const character = await prisma.character.create({ data: characterSchema.parse(req.body) });
    return { character };
  },
});
