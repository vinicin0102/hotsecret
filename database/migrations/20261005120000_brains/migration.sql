-- Cérebro (IA de respostas)
CREATE TABLE "brains" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "persona" TEXT NOT NULL DEFAULT '',
    "knowledge" TEXT NOT NULL DEFAULT '',
    "rules" TEXT NOT NULL DEFAULT '',
    "offers" JSONB NOT NULL DEFAULT '[]',
    "audios" JSONB NOT NULL DEFAULT '[]',
    "maxReplies" INTEGER NOT NULL DEFAULT 30,
    "fallbackMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brains_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "brains" ENABLE ROW LEVEL SECURITY;
