-- Moeda do produto (BRL ou MXN) para operar fora do Brasil
ALTER TABLE "products" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'BRL';
