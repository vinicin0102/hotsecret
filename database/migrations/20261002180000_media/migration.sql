-- Arquivos enviados pelo painel (fallback quando não há storage externo)
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;
