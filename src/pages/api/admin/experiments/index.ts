import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { experimentSchema } from "@/lib/validation";
import { experimentReport } from "@/services/analytics";

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const experiments = await prisma.experiment.findMany({ orderBy: { createdAt: "desc" }, include: { variants: true } });
    const reports = await Promise.all(experiments.map((e) => experimentReport(e.id)));
    return { experiments: experiments.map((e, i) => ({ ...e, report: reports[i] })) };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const data = experimentSchema.parse(req.body);
    const experiment = await prisma.experiment.create({
      data: { name: data.name, slug: data.slug, active: data.active, variants: { create: data.variants } },
    });
    return { experiment };
  },
});
