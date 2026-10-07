-- Pixel da Meta próprio por produto/oferta (e token da API de Conversões, criptografado)
ALTER TABLE "products" ADD COLUMN "metaPixelId" TEXT;
ALTER TABLE "products" ADD COLUMN "metaCapiTokenSealed" TEXT;
