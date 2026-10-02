import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export default apiHandler({
  PATCH: async (req) => {
    await requireAdmin(req);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    return { experiment: await prisma.experiment.update({ where: { id: String(req.query.id) }, data: { active } }) };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.experiment.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
