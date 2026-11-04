-- TikTok: id do clique no anúncio e cookie do pixel, para a API de Eventos. Colunas opcionais: instantâneas.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ttclid" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ttp" TEXT;
