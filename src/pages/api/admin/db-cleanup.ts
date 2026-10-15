import { z } from "zod";
import { apiHandler, rateLimit, requireAdmin } from "@/lib/api";
import { CLEANUPS, DEFAULT_DAYS, dbSizes, previewCleanup, runCleanup, vacuumAfter } from "@/services/db-cleanup";

// Limpeza do banco (só o dono): tamanho das tabelas, prévia de cada limpeza e apagar em lotes.
export const config = { maxDuration: 60 };

const schema = z.object({
  action: z.enum(["preview", "run", "vacuum"]),
  id: z.enum(CLEANUPS),
  days: z.number().int().min(1).max(3650).optional(),
});

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req, "OWNER");
    return { ...(await dbSizes()), defaults: DEFAULT_DAYS };
  },
  POST: async (req) => {
    await requireAdmin(req, "OWNER");
    rateLimit(req, "db-cleanup", 120, 60_000);
    const body = schema.parse(req.body);
    const days = body.days ?? DEFAULT_DAYS[body.id];
    if (body.action === "preview") return previewCleanup(body.id, days);
    if (body.action === "run") return runCleanup(body.id, days);
    await vacuumAfter(body.id);
    return { ok: true };
  },
});
