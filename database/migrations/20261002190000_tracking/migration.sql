-- Pixels / API de Conversões
ALTER TABLE "leads" ADD COLUMN "clientIp" TEXT;
ALTER TABLE "leads" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "leads" ADD COLUMN "fbp" TEXT;
ALTER TABLE "leads" ADD COLUMN "fbc" TEXT;

CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
