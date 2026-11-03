-- Índices dos caminhos mais usados pelo chat: consulta do Pix (por conversa), conteúdo liberado (por lead)
-- e vendas por data de aprovação (painel). Tabelas pequenas: criação rápida.
-- CreateIndex
CREATE INDEX IF NOT EXISTS "conversations_leadId_idx" ON "conversations"("leadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_conversationId_createdAt_idx" ON "payments"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_leadId_status_idx" ON "payments"("leadId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_status_approvedAt_idx" ON "payments"("status", "approvedAt");

