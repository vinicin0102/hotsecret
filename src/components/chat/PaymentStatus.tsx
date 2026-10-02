import { useState } from "react";
import { formatBRL } from "@/lib/format";
import type { PublicPaymentInfo } from "@/features/chat-engine/transport";

export function PaymentStatus({
  payment,
  productName,
  onRetry,
  onSimulate,
}: {
  payment: PublicPaymentInfo | undefined;
  productName?: string;
  onRetry?: () => void;
  onSimulate?: (status: "APPROVED" | "FAILED") => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!payment) return null;
  const pending = payment.status === "PENDING" || payment.status === "CREATED";

  const copy = async () => {
    if (!payment.pixQrCode) return;
    try {
      await navigator.clipboard.writeText(payment.pixQrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* navegador sem permissão de clipboard */
    }
  };

  return (
    <div className="msg-row bot">
      <div className="card-msg payment-card">
        <div className="card-body">
          <div className="eyebrow">{payment.method === "PIX" ? "Pagamento via PIX" : "Pagamento com cartão"}</div>
          <h3 style={{ fontSize: 17 }}>
            {productName ?? "Seu pedido"} · {formatBRL(payment.amount)}
          </h3>

          {payment.status === "APPROVED" && <div className="status-line status-approved">✓ Pagamento confirmado. Acesso liberado!</div>}
          {payment.status === "FAILED" && (
            <>
              <div className="status-line status-failed">Pagamento não aprovado.</div>
              {onRetry && (
                <button className="btn btn-primary btn-block" onClick={onRetry}>
                  Tentar novamente
                </button>
              )}
            </>
          )}
          {payment.status === "REFUNDED" && <div className="status-line status-failed">Pagamento estornado.</div>}

          {pending && payment.method === "PIX" && (
            <>
              {payment.pixQrCodeBase64 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="qr" src={`data:image/png;base64,${payment.pixQrCodeBase64}`} alt="QR Code PIX" />
              )}
              <p style={{ fontSize: 13 }}>Copie o código abaixo e pague no app do seu banco (PIX copia e cola):</p>
              {payment.pixQrCode && <div className="pix-code">{payment.pixQrCode}</div>}
              <button className="btn btn-gold btn-block" style={{ marginTop: 10 }} onClick={copy}>
                {copied ? "Código copiado ✓" : "Copiar código PIX"}
              </button>
            </>
          )}
          {pending && payment.method === "CARD" && payment.redirectUrl && (
            <a className="btn btn-primary btn-block" href={payment.redirectUrl} target="_blank" rel="noopener noreferrer">
              Abrir pagamento seguro
            </a>
          )}
          {pending && (
            <div className="status-line">
              <span className="spinner" /> Aguardando confirmação do pagamento...
            </div>
          )}

          {pending && onSimulate && (
            <div className="sandbox-box">
              Ambiente de teste — nenhum valor é cobrado.
              <div className="row">
                <button className="btn btn-sm" onClick={() => onSimulate("APPROVED")}>
                  Simular aprovação
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => onSimulate("FAILED")}>
                  Simular recusa
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
