import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { vipGroupSchema, vipGroupData } from "@/services/vip-admin";
import { vipMemberCounts } from "@/services/vip";

// Grupos VIP: lista e criação
export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const groups = await prisma.vipGroup.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { posts: true } } } });
    const members = await vipMemberCounts(groups);
    return { groups: groups.map(({ _count, ...g }) => ({ ...g, postCount: _count.posts, memberCount: members.get(g.id) ?? 0 })) };
  },
  POST: async (req) => {
    await requireAdmin(req);
    const data = vipGroupSchema.parse(req.body);
    if (await prisma.vipGroup.findUnique({ where: { slug: data.slug } })) throw new HttpError(409, "Esse link já está em uso por outro grupo");
    const group = await prisma.vipGroup.create({ data: vipGroupData(data) });
    return { group };
  },
});
