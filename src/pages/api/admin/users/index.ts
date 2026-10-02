import bcrypt from "bcryptjs";
import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sanitizeText } from "@/lib/sanitize";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(200),
  role: z.enum(["ADMIN", "VIEWER"]),
});

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req, "OWNER");
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return { users };
  },
  POST: async (req) => {
    await requireAdmin(req, "OWNER");
    const b = schema.parse(req.body);
    const user = await prisma.user.create({
      data: { name: sanitizeText(b.name, 80), email: b.email, role: b.role, passwordHash: await bcrypt.hash(b.password, 12) },
      select: { id: true },
    });
    return { user };
  },
  DELETE: async (req) => {
    const s = await requireAdmin(req, "OWNER");
    const id = String(req.query.id ?? "");
    if (id && id !== s.uid) await prisma.user.delete({ where: { id } });
    return { ok: true };
  },
});
