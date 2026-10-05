-- Cérebro: imagens (prévias) que a IA pode enviar
ALTER TABLE "brains" ADD COLUMN "images" JSONB NOT NULL DEFAULT '[]';
