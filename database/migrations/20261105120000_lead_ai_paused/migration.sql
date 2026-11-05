-- IA encerrada por lead (painel → Conversas/Lead). Coluna opcional: instantânea.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "aiPausedAt" TIMESTAMP(3);
