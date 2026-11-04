-- Pixel da conta de anúncios de origem do lead (?px= no link do anúncio). Coluna opcional: instantânea no Postgres.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "adPixelId" TEXT;
