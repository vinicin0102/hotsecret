-- Zenith Payments API: idempotência por intenção, resultado incerto, instruções de pagamento
ALTER TABLE "payments" ADD COLUMN "idempotencyKey" TEXT;
-- texto (não JSONB): o retry precisa reenviar exatamente os mesmos bytes
ALTER TABLE "payments" ADD COLUMN "providerRequest" TEXT;
ALTER TABLE "payments" ADD COLUMN "uncertain" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "payments" ADD COLUMN "methodCode" TEXT;
ALTER TABLE "payments" ADD COLUMN "nextAction" JSONB;
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- Webhooks já processados (consumidor idempotente)
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "webhook_events"("provider", "eventId");
