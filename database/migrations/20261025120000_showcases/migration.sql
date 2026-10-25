-- Vitrine: carrossel de modelos (cada card leva ao fluxo/chat da modelo)
CREATE TABLE "showcases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "items" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "showcases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "showcases_slug_key" ON "showcases"("slug");
