-- WhatsApp (Evolution API): número do lead → lead + conversa respondida pelo Cérebro
CREATE TABLE "whatsapp_contacts" (
    "id" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "leadId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "pausedUntil" TIMESTAMP(3),
    "noticeSent" BOOLEAN NOT NULL DEFAULT false,
    "lastInboundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_contacts_jid_key" ON "whatsapp_contacts"("jid");
CREATE INDEX "whatsapp_contacts_lastInboundAt_idx" ON "whatsapp_contacts"("lastInboundAt");
CREATE INDEX "whatsapp_contacts_conversationId_idx" ON "whatsapp_contacts"("conversationId");
