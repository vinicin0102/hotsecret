// "Melhorar com IA": a IA em uso sugere um campo do cérebro (personalidade, perguntas/objeções, regras, exemplos).
// Nada é salvo aqui: o painel mostra a sugestão e o dono decide se usa.
import { z } from "zod";
import { apiHandler, HttpError, rateLimit, requireAdmin } from "@/lib/api";
import { describeAiError, improveBrainField } from "@/services/ai/brain";

export const config = { maxDuration: 60 };

const t = (n: number) => z.string().max(n).optional();
const schema = z.object({
  field: z.enum(["persona", "knowledge", "mustRules", "examples"]),
  about: t(2000),
  language: z.enum(["pt-BR", "es-MX"]).optional(),
  draft: z.object({
    name: t(200),
    persona: t(12000),
    knowledge: t(120000),
    rules: t(12000),
    mustRules: t(12000),
    examples: t(24000),
    offers: z
      .array(z.object({ productId: z.string().max(64), when: t(2000), pitch: t(4000), style: t(20) }))
      .max(20)
      .optional(),
  }),
});

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    rateLimit(req, "brain-improve", 30, 10 * 60_000);
    const { field, draft, about, language } = schema.parse(req.body);
    try {
      return { text: await improveBrainField(field, draft, about, language) };
    } catch (e) {
      throw new HttpError(502, e instanceof Error && e.message.startsWith("A IA") ? e.message : describeAiError(e));
    }
  },
});
