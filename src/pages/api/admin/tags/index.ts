import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { tagSchema } from "@/lib/validation";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { leads: true } } } });
    return { tags };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const tag = await prisma.tag.create({ data: tagSchema.parse(req.body) });
    return { tag };
  },
});
