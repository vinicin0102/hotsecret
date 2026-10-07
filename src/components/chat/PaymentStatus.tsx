import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useChatI18n } from "@/features/i18n/chat";
import type { PublicPaymentInfo } from "@/features/chat-engine/transport";

/** Imagem do gateway (URL, data URI ou base64 puro) — usada só se não der para gerar o QR localmente. */
function gatewayQrSrc(v: string): string {
  if (/^https:\/\//.test(v) || v.startsWith("data:image/")) return v;
  return `data:image/png;base64,${v}`;
}

/** QR Code gerado no navegador a partir do PIX copia e cola (não depende da imagem do gateway). */
function usePixQr(code: string | null | undefined, fallback: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!code) {
      setSrc(fallback ? gatewayQrSrc(fallback) : null);
      return;
    }
    QRCode.toDataURL(code, { margin: 1, width: 400, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(fallback ? gatewayQrSrc(fallback) : null));
    return () => {
      alive = false;
    };
  }, [code, fallback]);
  return src;
}

export function PaymentStatus({
  payment,
  productName,
  onRetry,
  onSimulate,
  previewMode,
}: {
  payment: PublicPaymentInfo | undefined;
  productName?: string;
  onRetry?: () => void;
  onSimulate?: (status: "APPROVED" | "FAILED") => void;
  /** pré-visualização do construtor / rascunho: nada é cobrado */
  previewMode?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const { t, money } = useChatI18n();
  const qr = usePixQr(payment?.pixQrCode, payment?.pixQrCodeBase64);
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
          <div className="eyebrow">{payment.method === "PIX" ? t.payEyebrowPix : t.payEyebrowCard}</div>
          <h3 style={{ fontSize: 17 }}>
            {productName ?? t.yourOrder} · {money(payment.amount, payment.currency)}
          </h3>

          {payment.status === "APPROVED" && <div className="status-line status-approved">{t.approved}</div>}
          {payment.status === "FAILED" && (
            <>
              <div className="status-line status-failed">{t.notApproved}</div>
              {onRetry && (
                <button className="btn btn-primary btn-block" onClick={onRetry}>
                  {t.retry}
                </button>
              )}
            </>
          )}
          {payment.status === "REFUNDED" && <div className="status-line status-failed">{t.refunded}</div>}

          {pending && payment.method === "PIX" && (
            <>
              {qr && payment.currency !== "MXN" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="qr" src={qr} alt="QR Code PIX" />
              )}
              <p style={{ fontSize: 13 }}>{t.copyInstructions}</p>
              {payment.pixQrCode && <div className="pix-code">{payment.pixQrCode}</div>}
              <button className="btn btn-gold btn-block" style={{ marginTop: 10 }} onClick={copy}>
                {copied ? t.copied : t.copyCode}
              </button>
            </>
          )}
          {pending && payment.method === "CARD" && payment.redirectUrl && (
            <a className="btn btn-primary btn-block" href={payment.redirectUrl} target="_blank" rel="noopener noreferrer">
              {t.openSecure}
            </a>
          )}
          {pending && (
            <div className="status-line">
              <span className="spinner" /> {t.waitingPayment}
            </div>
          )}

          {pending && onSimulate && (
            <div className="sandbox-box">
              {previewMode ? t.previewNote : t.testNote}
              <div className="row">
                <button className="btn btn-sm" onClick={() => onSimulate("APPROVED")}>
                  {t.simApprove}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => onSimulate("FAILED")}>
                  {t.simFail}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
