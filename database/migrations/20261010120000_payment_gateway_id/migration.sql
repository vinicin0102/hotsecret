-- id do pagamento no gateway (Zenith: payment.id), conferido no webhook junto com o checkout
ALTER TABLE "payments" ADD COLUMN "gatewayPaymentId" TEXT;
