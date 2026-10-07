// Chave da API e modelo da IA. A chave nunca volta ao navegador (só uma dica: começo e fim).
import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getAiSettingsPublic, saveAiSettings } from "@/services/ai/brain";

const schema = z.object({
  /** IA usada nas conversas; a chave e o modelo abaixo são desta IA */
  provider: z.enum(["anthropic", "deepseek"]).optional(),
  /** undefined = manter · null = remover · string = nova chave */
  apiKey: z.string().trim().min(20, "Chave muito curta").max(400).nullable().optional(),
  model: z.string().max(60).optional(),
});

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    // saúde da IA nas últimas 24h: respostas, falhas e os motivos mais recentes
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [replies, failures, recent] = await Promise.all([
      prisma.event.count({ where: { type: "ai_reply", createdAt: { gte: since } } }),
      prisma.event.count({ where: { type: "ai_error", createdAt: { gte: since } } }),
      prisma.event.findMany({ where: { type: "ai_error" }, orderBy: { createdAt: "desc" }, take: 8, select: { createdAt: true, data: true } }),
    ]);
    return {
      settings: await getAiSettingsPublic(),
      health: {
        replies,
        failures,
        recent: recent.map((e) => ({ at: e.createdAt, error: String((e.data as { error?: string } | null)?.error ?? "erro") })),
      },
    };
  },
  PUT: async (req) => {
    await requireAdmin(req, "OWNER");
    await saveAiSettings(schema.parse(req.body));
    return { settings: await getAiSettingsPublic() };
  },
});
