import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { showcaseData, showcaseItems, showcaseSchema } from "@/services/showcase";

// Vitrine: dados, editar, excluir
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const s = await prisma.showcase.findUnique({ where: { id: String(req.query.id) } });
    if (!s) throw new HttpError(404, "Vitrine não encontrada");
    return { showcase: { ...s, items: showcaseItems(s.items) } };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const id = String(req.query.id);
    const data = showcaseSchema.parse(req.body);
    const other = await prisma.showcase.findUnique({ where: { slug: data.slug } });
    if (other && other.id !== id) throw new HttpError(409, "Esse link já está em uso por outra vitrine");
    const showcase = await prisma.showcase.update({ where: { id }, data: showcaseData(data) });
    return { showcase };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.showcase.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
