import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { vipGroupSchema, vipGroupData } from "@/services/vip-admin";

// Grupo VIP: dados do grupo com os posts; editar; excluir (os posts vão junto)
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const group = await prisma.vipGroup.findUnique({
      where: { id: String(req.query.id) },
      include: { posts: { orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }] } },
    });
    if (!group) throw new HttpError(404, "Grupo não encontrado");
    return { group };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const id = String(req.query.id);
    const data = vipGroupSchema.parse(req.body);
    const other = await prisma.vipGroup.findUnique({ where: { slug: data.slug } });
    if (other && other.id !== id) throw new HttpError(409, "Esse link já está em uso por outro grupo");
    const group = await prisma.vipGroup.update({ where: { id }, data: vipGroupData(data) });
    return { group };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.vipGroup.delete({ where: { id: String(req.query.id) } });
    return { ok: true };
  },
});
