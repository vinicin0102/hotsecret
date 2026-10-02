import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { automationSchema } from "@/lib/validation";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    return { automations: await prisma.automation.findMany({ orderBy: { createdAt: "asc" } }) };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const automation = await prisma.automation.create({ data: automationSchema.parse(req.body) });
    return { automation };
  },
});
