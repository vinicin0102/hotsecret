// Canal VIP AO VIVO: ligação ao entrar, topo de live, cards de prévia, upgrade com 2 ingressos,
// pagamento com o chat acima e o pop-up "vai desistir agora?".
import { useRef, useState, type TouchEvent } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import type { OfferContent, PublicCharacter, PublicProduct, VipOfferTexts } from "@/types/flow";
import type { PayMethods, PayerData, PublicPaymentInfo } from "@/features/chat-engine/transport";
import { useRingtone } from "./VideoCall";
import { AudioMessage, VideoMessage } from "./MediaMessages";
import { PayerForm } from "./PayerForm";

const CamIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" />
  </svg>
);
const HangIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" style={{ transform: "rotate(135deg)" }}>
    <path
      fill="currentColor"
      d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"
    />
  </svg>
);
const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  </svg>
);

/** Tela de ligação da entrada: atender (ou deslizar para cima) abre o chat ao vivo. */
export function LiveIncomingCall({
  character,
  ringText,
  onAccept,
  onDecline,
}: {
  character: PublicCharacter;
  ringText?: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  useRingtone(true);
  const { t } = useChatI18n();
  const startY = useRef<number | null>(null);
  const [drag, setDrag] = useState(0);
  const onStart = (e: TouchEvent) => (startY.current = e.touches[0]?.clientY ?? null);
  const onMove = (e: TouchEvent) => {
    if (startY.current == null) return;
    setDrag(Math.max(0, Math.min(140, startY.current - (e.touches[0]?.clientY ?? startY.current))));
  };
  const onEnd = () => {
    if (drag > 90) onAccept();
    startY.current = null;
    setDrag(0);
  };
  return (
    <div className="live-ring" role="dialog" aria-label={`${t.liveIncoming} · ${character.name}`} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
      <div className="live-ring-top" style={{ transform: `translateY(${-drag / 3}px)` }}>
        <div className="live-ring-avatar">
          {character.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.avatarUrl} alt="" />
          ) : (
            <span>{character.name.slice(0, 1)}</span>
          )}
        </div>
        <div className="live-ring-name">{character.name}</div>
        <div className="live-ring-kind">{t.liveIncoming}</div>
        <div className="live-ring-sub">{ringText?.replace(/\{nome\}/gi, character.name) || `${character.name} ${t.liveWants}`}</div>
      </div>
      <div className="live-ring-bottom">
        <div className="live-swipe" style={{ opacity: 1 - drag / 140 }}>
          <span className="live-swipe-arrow">︽</span>
          {t.swipeUp}
        </div>
        <div className="live-ring-actions">
          <div>
            <button className="live-ring-btn decline" onClick={onDecline} aria-label={t.decline}>
              <HangIcon />
            </button>
            <span>{t.decline}</span>
          </div>
          <div>
            <button className="live-ring-btn accept" onClick={onAccept} aria-label={t.answer}>
              <CamIcon />
            </button>
            <span>{t.answer}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Topo do chat ao vivo: foto, nome, AO VIVO, idade e cidade. */
export function LiveHeader({ character, typing, age, city }: { character: PublicCharacter; typing: boolean; age?: number; city?: string }) {
  const { t } = useChatI18n();
  const facts = [age ? `${age} ${t.years}` : "", city ? `📍 ${city}` : ""].filter(Boolean).join(" · ");
  return (
    <header className="live-header">
      <div className="live-header-avatar">
        {character.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={character.avatarUrl} alt={character.name} />
        ) : (
          <span>{character.name.slice(0, 1)}</span>
        )}
      </div>
      <div className="live-header-who">
        <div className="live-header-name">
          {character.name} <span className="live-badge">● {t.liveBadge}</span>
        </div>
        <div className="live-header-facts">{typing ? t.typing : facts}</div>
      </div>
    </header>
  );
}

/** Botão laranja acima da caixa de texto: libera a próxima prévia. */
export function LivePreviewButton({ label, left, busy, onClick }: { label?: string; left: number; busy: boolean; onClick: () => void }) {
  const { t } = useChatI18n();
  return (
    <div className="live-preview-bar">
      <button className="live-preview-btn" onClick={onClick} disabled={busy}>
        <EyeIcon /> {label || t.previewBtn} ({left} {left === 1 ? t.remainingOne : t.remaining})
      </button>
    </div>
  );
}

/** Card de uma prévia liberada: mídia, legenda, quantas faltam e o rodapé. */
export function LivePreviewCard({
  character,
  kind,
  url,
  caption,
  n,
  total,
  footer,
}: {
  character: PublicCharacter;
  kind: string;
  url: string;
  caption?: string;
  n: number;
  total: number;
  footer?: string;
}) {
  const { t } = useChatI18n();
  const left = Math.max(0, total - n);
  return (
    <div className="msg-row bot">
      <div className="live-preview-card">
        <div className="live-from">{character.name} 🔥</div>
        <div className="live-preview-media">
          {kind === "video" ? (
            <VideoMessage url={url} />
          ) : kind === "audio" ? (
            <AudioMessage url={url} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" />
          )}
        </div>
        {caption && <div className="live-preview-caption">{caption}</div>}
        <div className="live-preview-foot">
          <div className="live-preview-left">🔥 {left === 0 ? t.lastPreview : left === 1 ? t.previewLeftOne : t.previewsLeft.replace("{n}", String(left))}</div>
          <div className="live-preview-footer">{footer || t.previewFooter}</div>
        </div>
      </div>
    </div>
  );
}

/** Upgrade com os dois ingressos (acesso completo e acesso básico). */
export function VipOfferModal({
  offer,
  product,
  basic,
  onPick,
  onClose,
}: {
  offer: OfferContent;
  product: PublicProduct | undefined;
  basic: PublicProduct | undefined;
  onPick: (productId: string) => void;
  onClose: () => void;
}) {
  const { t, money } = useChatI18n();
  const v: VipOfferTexts = offer.vip ?? {};
  if (!product) return null;
  const benefits = (v.benefits ?? []).filter(Boolean);
  return (
    <div className="vip-overlay" role="dialog" aria-label={v.title || t.vipTitle}>
      <div className="vip-modal">
        <button className="vip-close" onClick={onClose} aria-label={t.close}>
          ✕
        </button>
        <div className="vip-badge">{v.badge || t.vipBadge}</div>
        <h2 className="vip-title">
          {v.title || t.vipTitle}
          <br />
          <span>{v.highlight || t.vipHighlight}</span>
        </h2>
        {(benefits.length > 0 || v.intro) && (
          <div className="vip-benefits">
            <div className="vip-intro">{v.intro || t.vipIntro}</div>
            {benefits.map((b, i) => (
              <div key={i} className="vip-benefit">
                <span>⭐</span> {b}
              </div>
            ))}
          </div>
        )}
        <div className="vip-secret">🔒 {t.vipSecret}</div>
        <div className="vip-once">{t.vipOnce}</div>
        {product.originalPrice && product.originalPrice > product.price ? (
          <div className="vip-old">
            {t.vipFrom} {money(product.originalPrice, product.currency)}
          </div>
        ) : null}
        <div className="vip-price">{money(product.price, product.currency)}</div>
        <button className="vip-ticket main" onClick={() => onPick(product.id)}>
          ✓ {v.completeLabel || t.vipComplete} ({money(product.price, product.currency)}) 🔥
        </button>
        {basic && (
          <button className="vip-ticket basic" onClick={() => onPick(basic.id)}>
            {v.basicLabel || t.vipBasic} ({money(basic.price, basic.currency)})
          </button>
        )}
      </div>
    </div>
  );
}

/** Card compacto no chat: reabre o upgrade ou o pagamento. */
export function VipOfferCard({ offer, product, bought, onOpen }: { offer: OfferContent; product: PublicProduct | undefined; bought: boolean; onOpen: () => void }) {
  const { t, money } = useChatI18n();
  if (!product) return <div className="bubble system">{t.offerUnavailable}</div>;
  return (
    <div className="msg-row bot">
      <div className="vip-card">
        <div className="vip-card-top">
          <span className="live-badge">● {t.liveBadge}</span> <b>{offer.headline || product.name}</b>
        </div>
        <div className="vip-card-price">{money(product.price, product.currency)}</div>
        <button className="vip-ticket main" onClick={onOpen} disabled={bought}>
          {offer.ctaLabel || t.vipSeeOffer} 🔥
        </button>
      </div>
    </div>
  );
}

/** Folha do pagamento (embaixo, com o chat visível em cima). */
export function VipPaySheet({
  character,
  offer,
  payment,
  error,
  payerForm,
  onClose,
  onSimulate,
}: {
  character: PublicCharacter;
  offer: OfferContent;
  payment: PublicPaymentInfo | undefined;
  error: string | null;
  payerForm?: { loadMethods: () => Promise<PayMethods | null>; initial: PayerData | null; onSubmit: (payer: PayerData) => Promise<unknown> };
  onClose: () => void;
  onSimulate?: (paymentId: string, status: "APPROVED" | "FAILED") => void;
}) {
  const { t, money } = useChatI18n();
  const v = offer.vip ?? {};
  const [copied, setCopied] = useState(false);
  const code = payment?.pixQrCode ?? "";
  const transfer = payment?.nextAction?.type === "bank_transfer";
  const copy = async () => {
    if (!code) return;
    setCopied(true);
    try {
      await Promise.race([navigator.clipboard.writeText(code), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500))]);
    } catch {
      const el = document.getElementById("vip-code-text");
      if (el) window.getSelection()?.selectAllChildren(el);
    }
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className="vip-sheet" role="dialog" aria-label={t.vipPending}>
      <div className="vip-sheet-head">
        <span className="vip-pending">● {t.vipPending}</span>
        <button className="vip-sheet-close" onClick={onClose} aria-label={t.close}>
          ✕
        </button>
      </div>
      <div className="vip-sheet-title">🔥 {v.payTitle?.replace(/\{nome\}/gi, character.name.toUpperCase()) || `${character.name.toUpperCase()} ${t.vipStarted}`}</div>
      <div className="vip-sheet-sub">{v.paySubtitle || t.vipStartedSub}</div>
      {payerForm && !payment ? (
        <PayerForm
          loadMethods={payerForm.loadMethods}
          initial={payerForm.initial}
          submitLabel={t.continue}
          busyLabel={t.generatingKey}
          onSubmit={payerForm.onSubmit}
          onNoForm={() => undefined}
          autoSubmit
        />
      ) : error ? (
        <div className="error-text">{error}</div>
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
          <button className="vip-copy" onClick={copy} disabled={!code}>
            ⧉ {copied ? t.vipCopied : t.vipCopy}
          </button>
          {/* transferência: a CLABE e o valor ficam à vista; no PIX o código fica escondido (só para copiar à mão) */}
          {transfer ? (
            <div className="vip-transfer">
              <span id="vip-code-text">{code}</span>
              <b>{money(payment.amount, payment.currency)}</b>
            </div>
          ) : (
            <span id="vip-code-text" className="vip-code-hidden">
              {code}
            </span>
          )}
          <div className="vip-waiting">● {t.vipWaiting}</div>
          {onSimulate && (payment.provider === "sandbox" || payment.provider === "preview") && (
            <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => onSimulate(payment.id, "APPROVED")}>
                {t.simApprove}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "Vai desistir agora?" — aparece quando ele tenta fechar o pagamento. */
export function VipExitModal({ offer, onStay, onLeave }: { offer: OfferContent; onStay: () => void; onLeave: () => void }) {
  const { t } = useChatI18n();
  const v = offer.vip ?? {};
  return (
    <div className="vip-overlay" role="dialog" aria-label={v.exitTitle || t.vipExitTitle}>
      <div className="vip-exit">
        <button className="vip-close" onClick={onStay} aria-label={t.close}>
          ✕
        </button>
        <div className="vip-exit-q">?</div>
        <h3>🔥 {v.exitTitle || t.vipExitTitle}</h3>
        <p>{v.exitText || t.vipExitText}</p>
        <button className="vip-stay" onClick={onStay}>
          {v.stayLabel || t.vipStay}
          <small>{v.stayHint || t.vipStayHint}</small>
        </button>
        <button className="vip-leave" onClick={onLeave}>
          {v.leaveLabel || t.vipLeave}
        </button>
      </div>
    </div>
  );
}
