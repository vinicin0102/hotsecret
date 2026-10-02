// Cria o primeiro administrador (OWNER). Só funciona enquanto não existir nenhum usuário.
import bcrypt from "bcryptjs";
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { adminCookie, signAdminSession } from "@/lib/auth";
import { sanitizeText } from "@/lib/sanitize";

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8, "A senha precisa de ao menos 8 caracteres").max(200),
});

export default apiHandler({
  GET: async () => ({ needsSetup: (await prisma.user.count()) === 0 }),
  POST: async (req, res) => {
    rateLimit(req, "setup", 5, 15 * 60_000);
    if ((await prisma.user.count()) > 0) throw new HttpError(403, "Configuração inicial já realizada");
    const body = schema.parse(req.body);
    const user = await prisma.user.create({
      data: { name: sanitizeText(body.name, 80), email: body.email, passwordHash: await bcrypt.hash(body.password, 12), role: "OWNER" },
    });
    const token = await signAdminSession({ uid: user.id, role: user.role, email: user.email });
    res.setHeader("Set-Cookie", adminCookie(token));
    return { ok: true };
  },
});
