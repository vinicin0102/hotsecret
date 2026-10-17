import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { vipPostSchema, vipPostData } from "@/services/vip-admin";

// Grupo VIP: novo post
export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    const groupId = String(req.query.id);
    if (!(await prisma.vipGroup.findUnique({ where: { id: groupId }, select: { id: true } }))) throw new HttpError(404, "Grupo não encontrado");
    const post = await prisma.vipPost.create({ data: { groupId, ...vipPostData(vipPostSchema.parse(req.body)) } });
    return { post };
  },
});
