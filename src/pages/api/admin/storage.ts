import { z } from "zod";
import { apiHandler, rateLimit, requireAdmin } from "@/lib/api";
import { checkR2, copyToR2, listSupabaseObjects, rewriteUrls, storageStatus } from "@/services/storage-migrate";

// Armazenamento: status e teste do Cloudflare R2 e migração dos arquivos do Supabase.
// O painel copia em lotes pequenos (vídeos grandes vão um por vez) para caber no tempo da função.
export const config = { maxDuration: 60 };

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check") }),
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("copy"), keys: z.array(z.string().min(1).max(300)).min(1).max(50) }),
  z.object({ action: z.literal("rewrite"), dryRun: z.boolean() }),
]);

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    return storageStatus();
  },
  POST: async (req) => {
    await requireAdmin(req, "OWNER");
    rateLimit(req, "storage", 600, 60_000);
    const body = schema.parse(req.body);
    if (body.action === "check") {
      const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
      const proto = String(req.headers["x-forwarded-proto"] ?? (host.startsWith("localhost") ? "http" : "https")).split(",")[0];
      const origin = String(req.headers.origin ?? `${proto}://${host}`);
      return { checks: await checkR2(origin) };
    }
    if (body.action === "list") return { objects: await listSupabaseObjects() };
    if (body.action === "copy") return { results: await copyToR2(body.keys) };
    return rewriteUrls(body.dryRun);
  },
});
