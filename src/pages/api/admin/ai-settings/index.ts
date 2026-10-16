// Chave da API e modelo da IA. A chave nunca volta ao navegador (só uma dica: começo e fim).
import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getAiSettingsPublic, saveAiSettings } from "@/services/ai/brain";

const schema = z.object({
  /** IA usada nas conversas; a chave e o modelo abaixo são desta IA */
  provider: z.enum(["anthropic", "deepseek", "qwen"]).optional(),
  /** undefined = manter · null = remover · string = nova chave */
  apiKey: z.string().trim().min(20, "Chave muito curta").max(400).nullable().optional(),
  model: z.string().max(60).optional(),
  /** IA reserva (null = nenhuma) */
  backupProvider: z.enum(["anthropic", "deepseek", "qwen"]).nullable().optional(),
});

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    // saúde da IA nas últimas 24h: respostas, falhas e os motivos mais recentes
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [replies, failures, recent] = await Promise.all([
      prisma.event.count({ where: { type: "ai_reply", createdAt: { gte: since } } }),
      prisma.event.count({ where: { type: "ai_error", createdAt: { gte: since } } }),
      prisma.event.findMany({ where: { type: { in: ["ai_error", "ai_backup"] } }, orderBy: { createdAt: "desc" }, take: 8, select: { createdAt: true, type: true, data: true } }),
    ]);
    const backupLabel: Record<string, string> = { anthropic: "Claude", deepseek: "DeepSeek", qwen: "Qwen" };
    const backups = await prisma.event.count({ where: { type: "ai_backup", createdAt: { gte: since } } });
    return {
      settings: await getAiSettingsPublic(),
      health: {
        replies,
        failures,
        backups,
        recent: recent.map((e) => {
          const d = (e.data as { error?: string; provider?: string } | null) ?? {};
          return e.type === "ai_backup"
            ? { at: e.createdAt, error: `a principal falhou — respondeu a reserva (${backupLabel[d.provider ?? ""] ?? d.provider})`, backup: true }
            : { at: e.createdAt, error: String(d.error ?? "erro") };
        }),
      },
    };
  },
  PUT: async (req) => {
    await requireAdmin(req, "OWNER");
    await saveAiSettings(schema.parse(req.body));
    return { settings: await getAiSettingsPublic() };
  },
});
