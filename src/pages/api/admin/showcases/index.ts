import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { showcaseData, showcaseItems, showcaseSchema } from "@/services/showcase";

// Vitrines: lista e criação
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const list = await prisma.showcase.findMany({ orderBy: { createdAt: "desc" } });
    return { showcases: list.map((s) => ({ ...s, itemCount: showcaseItems(s.items).length })) };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const data = showcaseSchema.parse(req.body);
    if (await prisma.showcase.findUnique({ where: { slug: data.slug } })) throw new HttpError(409, "Esse link já está em uso por outra vitrine");
    const showcase = await prisma.showcase.create({ data: showcaseData(data) });
    return { showcase };
  },
});
