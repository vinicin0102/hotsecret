-- conversa longa: mensagens do lead antes da primeira oferta (0 = desligado). Coluna com default: instantânea.
ALTER TABLE "brains" ADD COLUMN IF NOT EXISTS "warmupMessages" INTEGER NOT NULL DEFAULT 0;
