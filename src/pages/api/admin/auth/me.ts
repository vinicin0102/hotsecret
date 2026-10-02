import { apiHandler, HttpError, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export default apiHandler({
  GET: async (req) => {
    const s = await requireAdmin(req);
    const user = await prisma.user.findUnique({ where: { id: s.uid }, select: { id: true, name: true, email: true, role: true } });
    if (!user) throw new HttpError(401, "Não autenticado");
    return { user };
  },
});
