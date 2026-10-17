-- Grupo VIP: perfil da modelo com posts (fotos/vídeos) grátis, só para assinantes ou pagos à parte
CREATE TABLE "vip_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "characterId" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "productId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "published" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vip_posts" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "caption" TEXT,
    "media" JSONB NOT NULL DEFAULT '[]',
    "access" TEXT NOT NULL DEFAULT 'vip',
    "productId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vip_groups_slug_key" ON "vip_groups"("slug");
CREATE INDEX "vip_posts_groupId_publishedAt_idx" ON "vip_posts"("groupId", "publishedAt");

ALTER TABLE "vip_posts" ADD CONSTRAINT "vip_posts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "vip_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
