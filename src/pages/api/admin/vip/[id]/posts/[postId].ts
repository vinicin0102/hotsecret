import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { vipPostSchema, vipPostData } from "@/services/vip-admin";

// Grupo VIP: editar ou excluir um post
export default apiHandler({
  PUT: async (req) => {
    await requireAdmin(req);
    const where = { id: String(req.query.postId), groupId: String(req.query.id) };
    if (!(await prisma.vipPost.findFirst({ where, select: { id: true } }))) throw new HttpError(404, "Post não encontrado");
    const post = await prisma.vipPost.update({ where: { id: where.id }, data: vipPostData(vipPostSchema.parse(req.body)) });
    return { post };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await prisma.vipPost.deleteMany({ where: { id: String(req.query.postId), groupId: String(req.query.id) } });
    return { ok: true };
  },
});
