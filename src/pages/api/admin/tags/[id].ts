import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { tagSchema } from "@/lib/validation";

export default apiHandler({
  PUT: async (req) => {
    await requireAdmin(req);
    const tag = await prisma.tag.update({ where: { id: String(req.query.id) }, data: tagSchema.parse(req.body) });
    return { tag };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.tag.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
