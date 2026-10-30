// WhatsApp: qual Cérebro responde, idioma, aviso de atendimento automatizado e pausa geral.
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const KEY = "whatsapp";

export const DEFAULT_NOTICE = {
  "pt-BR": "🤖 Este é um atendimento automatizado.",
  "es-MX": "🤖 Esta es una atención automatizada.",
  "es-AR": "🤖 Esta es una atención automatizada.",
} as const;

export const whatsAppSettingsSchema = z.object({
  /** liga/desliga as respostas no WhatsApp */
  enabled: z.boolean().default(false),
  brainId: z.string().max(64).nullable().default(null),
  language: z.enum(["pt-BR", "es-MX", "es-AR"]).default("pt-BR"),
  /** primeira mensagem de cada contato: avisa que é atendimento automatizado (obrigatório) */
  notice: z.string().trim().min(3, "Escreva o aviso de atendimento automatizado").max(300).default(DEFAULT_NOTICE["pt-BR"]),
  /** pausa geral: as mensagens chegam no painel, mas a IA não responde ninguém */
  pausedAll: z.boolean().default(false),
});
export type WhatsAppSettings = z.infer<typeof whatsAppSettingsSchema>;

export async function getWhatsAppSettings(): Promise<WhatsAppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const parsed = whatsAppSettingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : whatsAppSettingsSchema.parse({});
}

export async function saveWhatsAppSettings(input: unknown): Promise<WhatsAppSettings> {
  const value = whatsAppSettingsSchema.parse(input);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return value;
}
