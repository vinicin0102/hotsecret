import bcrypt from "bcryptjs";
import { z } from "zod";
import { apiHandler, HttpError, rateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { adminCookie, signAdminSession } from "@/lib/auth";

let dummyHash: string | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("hot-secret-dummy", 12));

const schema = z.object({ email: z.string().trim().toLowerCase().max(160), password: z.string().min(1).max(200) });

export default apiHandler({
  POST: async (req, res) => {
    rateLimit(req, "login", 10, 15 * 60_000);
    const { email, password } = schema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    // compara mesmo sem usuário para não revelar e-mails cadastrados pelo tempo de resposta
    const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
    if (!user || !ok) throw new HttpError(401, "E-mail ou senha incorretos");
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = await signAdminSession({ uid: user.id, role: user.role, email: user.email });
    res.setHeader("Set-Cookie", adminCookie(token));
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  },
});
