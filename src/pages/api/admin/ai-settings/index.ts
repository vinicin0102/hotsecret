// Chave da API e modelo da IA. A chave nunca volta ao navegador (só uma dica: começo e fim).
import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { getAiSettingsPublic, saveAiSettings } from "@/services/ai/brain";

const schema = z.object({
  /** undefined = manter · null = remover · string = nova chave */
  apiKey: z.string().trim().min(20, "Chave muito curta").max(400).nullable().optional(),
  model: z.string().max(60).optional(),
});

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    return { settings: await getAiSettingsPublic() };
  },
  PUT: async (req) => {
    await requireAdmin(req, "OWNER");
    await saveAiSettings(schema.parse(req.body));
    return { settings: await getAiSettingsPublic() };
  },
});
