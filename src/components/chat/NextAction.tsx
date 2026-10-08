import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useChatI18n } from "@/features/i18n/chat";
import type { PaymentNextAction } from "@/features/chat-engine/transport";

/** Copia o texto e mostra "Copiado ✓" por 2s. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* navegador sem permissão de clipboard: o texto continua visível para copiar à mão */
    }
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  };
  return { copied, copy };
}

function QrImage({ code }: { code: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(code, { margin: 1, width: 400, errorCorrectionLevel: "M" })
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [code]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="qr" src={src} alt="QR" /> : null;
}

/**
 * Próxima ação do comprador exatamente como o gateway devolveu — nada é inventado:
 * bank_transfer (CLABE, banco, referência...), voucher (referência OXXO), qr_code, redirect e app_approval,
 * com o título e os passos enviados. A confirmação do pagamento vem só do servidor.
 */
export function NextActionView({ action, amount, compact }: { action: PaymentNextAction; amount?: string; compact?: boolean }) {
  const { t } = useChatI18n();
  const { copied, copy } = useCopy();
  const label = (k: string) => t.transferDetails[k] ?? k;
  const rows: [string, string][] = [
    ...Object.entries(action.details ?? {}),
    ...(action.type === "app_approval" ? Object.entries(action.app ?? {}) : []),
  ];
  const code = (action.type === "voucher" || action.type === "qr_code") && action.code ? action.code : null;
  const steps = action.instructions?.steps ?? [];

  return (
    <div className={`next-action ${compact ? "compact" : ""}`}>
      {action.instructions?.title && <p className="next-action-title">{action.instructions.title}</p>}

      {code && (
        <>
          {action.type === "qr_code" && <QrImage code={code} />}
          <div className="next-action-code-label">{action.type === "voucher" ? t.voucherReference : t.paymentCode}</div>
          <button type="button" className="next-action-code" onClick={() => copy("code", code)}>
            {code}
          </button>
          <button type="button" className="btn btn-gold btn-block" onClick={() => copy("code", code)}>
            {copied === "code" ? t.copied : action.type === "voucher" ? t.copyReference : t.copyCode}
          </button>
        </>
      )}

      {rows.length > 0 && (
        <dl className="transfer-details">
          {rows.map(([k, v]) => (
            <div key={k} onClick={() => copy(k, v)} role="button" tabIndex={0} title={t.copyCode}>
              <dt>{label(k)}</dt>
              <dd>
                {v} <span className="copy-hint">{copied === k ? "✓" : "⧉"}</span>
              </dd>
            </div>
          ))}
          {amount && action.type === "bank_transfer" && (
            <div onClick={() => copy("amount", amount.replace(/[^\d.,]/g, ""))} role="button" tabIndex={0}>
              <dt>{t.amountLabel}</dt>
              <dd>
                {amount} <span className="copy-hint">{copied === "amount" ? "✓" : "⧉"}</span>
              </dd>
            </div>
          )}
        </dl>
      )}

      {action.type === "redirect" && action.url && (
        <a className="btn btn-primary btn-block" href={action.url} target="_blank" rel="noopener noreferrer">
          {t.openSecure}
        </a>
      )}

      {steps.length > 0 && (
        <ol className="pix-steps">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
