import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { automationSchema } from "@/lib/validation";

export default apiHandler({
  PUT: async (req) => {
    await requireAdmin(req);
    const automation = await prisma.automation.update({ where: { id: String(req.query.id) }, data: automationSchema.parse(req.body) });
    return { automation };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.automation.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
