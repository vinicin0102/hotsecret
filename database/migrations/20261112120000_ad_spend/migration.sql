-- CreateTable
CREATE TABLE IF NOT EXISTS "ad_spend" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "adsetId" TEXT NOT NULL,
    "adsetName" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adName" TEXT NOT NULL,
    "spend" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_spend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ad_spend_day_idx" ON "ad_spend"("day");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ad_spend_accountId_day_idx" ON "ad_spend"("accountId", "day");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ad_spend_adId_day_key" ON "ad_spend"("adId", "day");

