// Upsell da chamada em tela cheia: aviso por cima do vídeo → card "bloqueado" com o preço → folha do pagamento.
// Os textos são do upsell (cada um com o seu tema); vazios usam o padrão do país do fluxo.
import { useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import type { PublicCharacter } from "@/types/flow";
import type { CallVideo, PublicPaymentInfo } from "@/features/chat-engine/transport";

type Marker = CallVideo["markers"][number];

export function UpsellScreen({
  marker,
  character,
  payment,
  bought,
  onBuy,
  onSkip,
  onSimulate,
}: {
  marker: Marker;
  character: PublicCharacter;
  /** pagamento deste upsell (depois de tocar em pagar) */
  payment: PublicPaymentInfo | undefined;
  bought: boolean;
  onBuy: () => void;
  onSkip: () => void;
  onSimulate?: (paymentId: string, status: "APPROVED" | "FAILED") => void;
}) {
  const { t, money } = useChatI18n();
  const [step, setStep] = useState<"notice" | "lock" | "pay">("notice");
  const [copied, setCopied] = useState(false);
  const s = marker.screen ?? {};
  const p = marker.product;
  const price = money(p.price, p.currency);
  const fill = (v: string) => v.replace(/\{nome\}/gi, character.name);
  const brl = (p.currency ?? "BRL") === "BRL";
  const code = payment?.pixQrCode ?? "";
  const transfer = payment?.nextAction?.type === "bank_transfer";

  const copy = async () => {
    if (!code) return;
    setCopied(true);
    try {
      await Promise.race([navigator.clipboard.writeText(code), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500))]);
    } catch {
      const el = document.getElementById("up-code-text");
      if (el) window.getSelection()?.selectAllChildren(el);
    }
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="up-screen" role="dialog" aria-label={s.title || marker.label}>
      {step === "notice" && (
        <div className="up-notice">
          <div className="up-icon">
            <span>{s.icon || "📡"}</span>
          </div>
          <h2 className="up-title">{fill(s.title || t.upTitle)}</h2>
          <div className="up-tag">{fill(s.tag || t.upTag)}</div>
          <p className="up-text">{fill(s.text || marker.text || t.upText)}</p>
          <button className="up-btn" onClick={() => setStep("lock")}>
            {fill(s.button || marker.ctaLabel || t.upButton)}
          </button>
        </div>
      )}

      {step === "lock" && (
        <div className="up-lock">
          <div className="up-lock-top">
            <div className="up-lock-icon">{s.lockIcon || "🔒"}</div>
            <div className="up-lock-badge">{fill(s.lockBadge || t.upLockBadge)}</div>
          </div>
          <div className="up-lock-body">
            <h3>{fill(s.lockTitle || t.upLockTitle)}</h3>
            <p>{fill(s.lockText || t.upLockText)}</p>
            <div className="up-fee">
              <div className="up-fee-label">{fill(s.feeLabel || p.name)}</div>
              {p.originalPrice && p.originalPrice > p.price ? <s className="up-fee-old">{money(p.originalPrice, p.currency)}</s> : null}
              <div className="up-fee-price">{price}</div>
              <div className="up-fee-note">{fill(s.feeNote || (brl ? t.upFeeNotePix : t.upFeeNote))}</div>
            </div>
            <button
              className="up-btn wide"
              onClick={() => {
                setStep("pay");
                onBuy();
              }}
            >
              {fill(s.payButton || s.button || t.upButton)} ({price})
            </button>
            <div className="up-foot">{fill(s.footNote || t.upFootNote)}</div>
            <button className="up-skip" onClick={onSkip}>
              {t.upNotNow}
            </button>
          </div>
        </div>
      )}

      {step === "pay" && (
        <div className="up-sheet">
          <div className="up-sheet-icon">{s.payIcon || s.icon || "🔓"}</div>
          <div className="up-sheet-title">{fill(s.payTitle || s.feeLabel || p.name)}</div>
          <div className="up-sheet-sub">
            {price} {brl ? `${t.upVia} PIX` : ""}
          </div>
          {bought ? (
            <div className="call-upsell-ok">{t.unlocked}</div>
          ) : !payment ? (
            <div className="vip-wait">
              <span className="once-spin" /> {t.generatingKey}
            </div>
          ) : payment.status === "FAILED" ? (
            <div className="error-text">{t.callNotApproved}</div>
          ) : (
            <>
              <div className="vip-steps">
                <span>
                  <b>1</b> {t.vipStepCopy}
                </span>
                <span className="vip-arrow">→</span>
                <span>
                  <b>2</b> {t.vipStepPaste}
                </span>
              </div>
              <button className="up-btn wide" onClick={copy} disabled={!code}>
                ⧉ {copied ? t.vipCopied : transfer || !brl ? t.upCopyTransfer : t.upCopyPix}
              </button>
              {transfer ? (
                <div className="vip-transfer">
                  <span id="up-code-text">{code}</span>
                  <b>{money(payment.amount, payment.currency)}</b>
                </div>
              ) : (
                <span id="up-code-text" className="vip-code-hidden">
                  {code}
                </span>
              )}
              <div className="up-waiting">● {t.vipWaiting}</div>
              {onSimulate && (payment.provider === "sandbox" || payment.provider === "preview") && (
                <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
                  <button className="btn btn-sm" onClick={() => onSimulate(payment.id, "APPROVED")}>
                    {t.simApprove}
                  </button>
                </div>
              )}
            </>
          )}
          <button className="up-skip" onClick={onSkip}>
            {t.upNotNow}
          </button>
        </div>
      )}
    </div>
  );
}
