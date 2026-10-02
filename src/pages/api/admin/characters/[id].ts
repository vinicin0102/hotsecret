import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { characterSchema } from "@/lib/validation";

export default apiHandler({
  PUT: async (req) => {
    await requireAdmin(req);
    const character = await prisma.character.update({ where: { id: String(req.query.id) }, data: characterSchema.parse(req.body) });
    return { character };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.character.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
