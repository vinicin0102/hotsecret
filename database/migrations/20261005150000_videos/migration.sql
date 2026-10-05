-- Vídeos com linha do tempo (chamada de vídeo / sala)
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "posterUrl" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "timeline" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "videos" ENABLE ROW LEVEL SECURITY;
