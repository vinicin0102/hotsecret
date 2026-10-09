// Oferta em formato de chamada de vídeo: tela de ligação recebida e a chamada em andamento.
import { useEffect, useRef, useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import type { PublicCharacter, PublicProduct } from "@/types/flow";
import type { CallVideo, ChatTransport, PayMethods, PayerData, PublicPaymentInfo } from "@/features/chat-engine/transport";
import { PaymentStatus } from "./PaymentStatus";
import { PayerForm } from "./PayerForm";
import { NextActionView } from "./NextAction";
import { UpsellScreen } from "./UpsellScreen";

/** Toque de celular sintetizado (sem arquivo) + vibração, enquanto a chamada está tocando. */
export function useRingtone(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext | null = null;
    try {
      ctx = Ctx ? new Ctx() : null;
    } catch {
      ctx = null;
    }
    const notes = [1046.5, 1318.5, 1568, 1318.5];
    const ring = () => {
      if (ctx && ctx.state === "running") {
        const t0 = ctx.currentTime;
        [0, 0.17, 0.34, 0.51, 1.0, 1.17, 1.34, 1.51].forEach((dt, i) => {
          const o = ctx!.createOscillator();
          const g = ctx!.createGain();
          o.type = "sine";
          o.frequency.value = notes[i % notes.length];
          g.gain.setValueAtTime(0.0001, t0 + dt);
          g.gain.exponentialRampToValueAtTime(0.22, t0 + dt + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.15);
          o.connect(g).connect(ctx!.destination);
          o.start(t0 + dt);
          o.stop(t0 + dt + 0.17);
        });
      }
      try {
        navigator.vibrate?.([700, 300, 700]);
      } catch {
        /* sem vibração */
      }
    };
    // navegadores só liberam som depois de um toque na página
    const unlock = () => void ctx?.resume().then(ring);
    void ctx?.resume().catch(() => undefined);
    ring();
    const iv = setInterval(ring, 2800);
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      clearInterval(iv);
      window.removeEventListener("pointerdown", unlock);
      try {
        navigator.vibrate?.(0);
      } catch {
        /* ignore */
      }
      void ctx?.close().catch(() => undefined);
    };
  }, [active]);
}

const PhoneIcon = ({ down }: { down?: boolean }) => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" style={down ? { transform: "rotate(135deg)" } : undefined}>
    <path
      fill="currentColor"
      d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"
    />
  </svg>
);
const CamIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" />
  </svg>
);

export function IncomingCall({
  character,
  onAccept,
  onDecline,
  kind = "video",
}: {
  character: PublicCharacter;
  onAccept: () => void;
  onDecline: () => void;
  kind?: "video" | "voice";
}) {
  useRingtone(true);
  const { t } = useChatI18n();
  return (
    <div className="call-overlay ringing" role="dialog" aria-label={`${kind === "voice" ? t.voiceCall : t.videoCall} · ${character.name}`}>
      {character.avatarUrl && <div className="call-bg" style={{ backgroundImage: `url(${character.avatarUrl})` }} />}
      <div className="call-top">
        <div className="call-kind">{kind === "voice" ? t.voiceCall : t.videoCall}</div>
        <div className="call-avatar-wrap">
          <span className="call-ring r1" />
          <span className="call-ring r2" />
          {character.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="call-avatar" src={character.avatarUrl} alt="" />
          ) : (
            <div className="call-avatar">{character.name.slice(0, 1)}</div>
          )}
        </div>
        <div className="call-name">{character.name}</div>
        <div className="call-status">
          {t.calling}
          <span className="dots">...</span>
        </div>
      </div>
      <div className="call-actions">
        <div>
          <button className="call-btn decline" onClick={onDecline} aria-label={t.decline}>
            <PhoneIcon down />
          </button>
          <span>{t.decline}</span>
        </div>
        <div>
          <button className="call-btn accept" onClick={onAccept} aria-label={t.answer}>
            {kind === "voice" ? <PhoneIcon /> : <CamIcon />}
          </button>
          <span>{t.answer}</span>
        </div>
      </div>
    </div>
  );
}

/** Pop-up só com o código PIX (copia e cola), ao atender ou ao recusar (downsell). */
export function PixPopup({
  character,
  product,
  payment,
  downsell,
  downsellText,
  error,
  onClose,
  onSimulate,
  payerForm,
  overVideo,
}: {
  /** chamada de vídeo 02: o pop-up fica embaixo, por cima do vídeo (FREE em loop) */
  overVideo?: boolean;
  character: PublicCharacter;
  product: PublicProduct | undefined;
  payment: PublicPaymentInfo | undefined;
  downsell?: boolean;
  downsellText?: string;
  error: string | null;
  onClose: () => void;
  onSimulate?: (paymentId: string, status: "APPROVED" | "FAILED") => void;
  /** o gateway pede os dados do comprador antes de gerar o pagamento */
  payerForm?: {
    loadMethods: () => Promise<PayMethods | null>;
    initial: PayerData | null;
    onSubmit: (payer: PayerData) => Promise<unknown>;
  };
}) {
  const [copied, setCopied] = useState(false);
  const { t, money } = useChatI18n();
  const code = payment?.pixQrCode ?? "";
  const failed = payment?.status === "FAILED";
  const copy = async () => {
    if (!code) return;
    setCopied(true);
    try {
      await Promise.race([navigator.clipboard.writeText(code), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 1500))]);
    } catch {
      // navegadores sem permissão de clipboard: seleciona o texto para copiar manualmente
      const el = document.getElementById("pix-code-text");
      if (el) window.getSelection()?.selectAllChildren(el);
    }
    setTimeout(() => setCopied(false), 2500);
  };
  return (
    <div className={`call-overlay pix ${overVideo ? "over-video" : ""}`} role="dialog" aria-label={t.payEyebrowPix}>
      {character.avatarUrl && !overVideo && <div className="call-bg" style={{ backgroundImage: `url(${character.avatarUrl})` }} />}
      <button className="pix-close" onClick={onClose} aria-label={t.close}>
        ✕
      </button>
      <div className="pix-box">
        {character.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="pix-avatar" src={character.avatarUrl} alt="" />
        ) : (
          <div className="pix-avatar">{character.name.slice(0, 1)}</div>
        )}
        <div className="pix-title">
          {downsell ? downsellText || t.downsellDefault : `${character.name} ${t.waitingInCall}`}
        </div>
        {product && (
          <div className="pix-product">
            {product.name}
            <b>
              {product.originalPrice && product.originalPrice > product.price ? <s>{money(product.originalPrice, product.currency)}</s> : null}{" "}
              {money(product.price, product.currency)}
            </b>
          </div>
        )}
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
          <div className="pix-wait">
            <span className="once-spin" /> {t.generatingKey}
          </div>
        ) : failed ? (
          <div className="error-text">{t.callNotApproved}</div>
        ) : payment.nextAction ? (
          <>
            {/* dados de pagamento do gateway (SPEI, OXXO...) exatamente como vieram */}
            <NextActionView action={payment.nextAction} amount={money(payment.amount, payment.currency)} compact />
            <ol className="pix-steps" start={(payment.nextAction.instructions?.steps?.length ?? 0) + 1}>
              <li>{t.step3}</li>
            </ol>
            <div className="pix-wait">
              <span className="once-spin" /> {t.waitingPay}
            </div>
          </>
        ) : (
          <>
            <div className="pix-label">
              {t.keyOf} {character.name.trim().split(/\s+/)[0]}
            </div>
            <div className="pix-code-box" id="pix-code-text" onClick={copy}>
              {code}
            </div>
            <button className="btn btn-primary btn-block cta-glow pix-copy" onClick={copy} disabled={!code}>
              {copied ? t.keyCopied : t.copyKey}
            </button>
            <ol className="pix-steps">
              <li>{t.step1}</li>
              <li>{t.step2}</li>
              <li>{t.step3}</li>
            </ol>
            <div className="pix-wait">
              <span className="once-spin" /> {t.waitingPay}
            </div>
            {onSimulate && payment && (payment.provider === "sandbox" || payment.provider === "preview") && (
              <div className="row" style={{ justifyContent: "center", marginTop: 8 }}>
                <button className="btn btn-sm" onClick={() => onSimulate(payment.id, "APPROVED")}>
                  {t.simApprove}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function CallScreen({
  nodeId,
  productId,
  character,
  transport,
  payments,
  mainProduct,
  error,
  onHangUp,
  onBuyUpsell,
  onSimulate,
  previewMode,
  freeLoop,
}: {
  /** chamada de vídeo 02: antes de pagar, o trecho FREE toca em loop */
  freeLoop?: boolean;
  nodeId: string;
  /** oferta do Cérebro (IA): produto da chamada */
  productId?: string;
  character: PublicCharacter;
  transport: ChatTransport | null;
  payments: Record<string, PublicPaymentInfo>;
  mainProduct: PublicProduct | undefined;
  error: string | null;
  onHangUp: () => void;
  onBuyUpsell: (productId: string) => void;
  onSimulate?: (paymentId: string, status: "APPROVED" | "FAILED") => void;
  previewMode?: boolean;
}) {
  const vRef = useRef<HTMLVideoElement>(null);
  const { t: tx, money } = useChatI18n();
  const [video, setVideo] = useState<CallVideo | null | undefined>(undefined);
  const [t, setT] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [needsTap, setNeedsTap] = useState(false);
  const [upsell, setUpsell] = useState<CallVideo["markers"][number] | null>(null);
  const [upsellBuying, setUpsellBuying] = useState(false);
  const shown = useRef(new Set<string>());

  const forNode = Object.values(payments).filter((p) => p.offerNodeId === nodeId);
  const mainPayments = forNode.filter((p) => p.productId === mainProduct?.id);
  const paid = mainPayments.some((p) => p.status === "APPROVED");
  const mainPayment = mainPayments.sort((a, b) => (a.status === "APPROVED" ? -1 : b.status === "APPROVED" ? 1 : 0))[0];
  const boughtUpsell = (pid: string) => forNode.some((p) => p.productId === pid && p.status === "APPROVED");
  const upsellPayment = upsell ? forNode.find((p) => p.productId === upsell.productId && p.status !== "FAILED") : undefined;
  const upsellDone = upsell ? boughtUpsell(upsell.productId) : false;
  // o loop de animação lê sempre o estado atual por aqui
  /** já viu o FREE (chamada de vídeo 02): depois de pagar, segue direto do VIP */
  const sawFree = useRef(false);
  if (freeLoop) sawFree.current = true;
  const live = useRef({ paid, upsell, boughtUpsell, freeLoop });
  live.current = { paid, upsell, boughtUpsell, freeLoop };

  // chamada de vídeo 02: ao atender, o trecho FREE já toca (em loop até pagar)
  useEffect(() => {
    const v = vRef.current;
    if (!v || !video || paid || !freeLoop) return;
    v.currentTime = video.free.start / 1000;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      setNeedsTap(true);
      void v.play().catch(() => undefined);
    });
  }, [video, paid, freeLoop]);

  useEffect(() => {
    let alive = true;
    transport
      ?.callVideo(nodeId, productId)
      .then((v) => alive && setVideo(v))
      .catch(() => alive && setVideo(null));
    const iv = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [transport, nodeId, productId]);

  // o vídeo só abre depois do pagamento: toca do começo e, no fim do VIP, volta ao início do VIP
  useEffect(() => {
    const v = vRef.current;
    if (!v || !video || !paid) return;
    v.currentTime = (sawFree.current ? video.vip.start : Math.min(video.free.start, video.vip.start)) / 1000;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      setNeedsTap(true);
      void v.play().catch(() => undefined);
    });
  }, [video, paid]);

  useEffect(() => {
    let raf = 0;
    let lastT = -1;
    const loop = () => {
      const v = vRef.current;
      const { paid, upsell, boughtUpsell, freeLoop } = live.current;
      if (v && video) {
        const ms = v.currentTime * 1000;
        if (!paid && freeLoop) {
          if (ms >= video.free.end || ms < video.free.start - 250) v.currentTime = video.free.start / 1000;
        } else if (!paid) {
          if (!v.paused) v.pause();
        } else if (ms >= video.vip.end) v.currentTime = video.vip.start / 1000;
        // atualiza a tela ~10x por segundo (falas na tela)
        if (Math.abs(ms - lastT) >= 100) {
          lastT = ms;
          setT(ms);
        }
        if (paid && !upsell) {
          const m = video.markers.find((mk) => !shown.current.has(mk.id) && ms >= mk.at && ms - mk.at < 1500 && !boughtUpsell(mk.productId));
          if (m) {
            shown.current.add(m.id);
            setUpsell(m);
            setUpsellBuying(false);
            // tela cheia: o vídeo para por baixo do aviso
            if (m.pause || m.style === "screen") v.pause();
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [video]);

  // upsell pago: mostra "Desbloqueado ✓", fecha e continua o vídeo
  useEffect(() => {
    if (!upsellDone) return;
    const id = setTimeout(() => {
      setUpsell(null);
      void vRef.current?.play().catch(() => undefined);
    }, 1500);
    return () => clearTimeout(id);
  }, [upsellDone]);

  const closeUpsell = () => {
    setUpsell(null);
    void vRef.current?.play().catch(() => undefined);
  };
  const cues = video ? video.chat.filter((c) => t >= c.start && t < c.end) : [];
  const mm = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="call-overlay active" role="dialog" aria-label={tx.videoCall}>
      {video ? (
        <video
          ref={vRef}
          className="call-video"
          src={video.url}
          poster={video.posterUrl || undefined}
          playsInline
          preload="auto"
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div className="call-connecting">
          {character.avatarUrl && <div className="call-bg" style={{ backgroundImage: `url(${character.avatarUrl})` }} />}
          <div className="call-status">{video === undefined ? tx.connecting : tx.cameraOff}</div>
        </div>
      )}
      <div className="call-hud">
        <div className="call-who">
          {character.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.avatarUrl} alt="" />
          ) : null}
          <div>
            <b>{character.name}</b>
            <small>
              <span className="live-dot" /> {mm}
            </small>
          </div>
        </div>
      </div>
      {needsTap && (
        <button
          className="call-unmute"
          onClick={() => {
            const v = vRef.current;
            if (v) {
              v.muted = false;
              void v.play();
            }
            setNeedsTap(false);
          }}
        >
          {tx.tapToHearVideo}
        </button>
      )}
      {cues.length > 0 && (
        <div className="call-cues">
          {cues.map((c) => (
            <div key={c.id} className="call-cue">
              <b>{character.name}</b> {c.text}
            </div>
          ))}
        </div>
      )}

      {upsell && upsell.style === "screen" && (
        <UpsellScreen
          key={upsell.id}
          marker={upsell}
          character={character}
          payment={upsellPayment}
          bought={boughtUpsell(upsell.productId)}
          onBuy={() => {
            setUpsellBuying(true);
            onBuyUpsell(upsell.productId);
          }}
          onSkip={closeUpsell}
          onSimulate={onSimulate}
        />
      )}
      {upsell && upsell.style !== "screen" && (
        <div className="call-upsell">
          <div className="call-upsell-text">{upsell.text || upsell.product.name}</div>
          <div className="call-upsell-price">
            {upsell.product.originalPrice && upsell.product.originalPrice > upsell.product.price ? (
              <s>{money(upsell.product.originalPrice, upsell.product.currency)}</s>
            ) : null}{" "}
            {money(upsell.product.price, upsell.product.currency)}
          </div>
          {boughtUpsell(upsell.productId) ? (
            <div className="call-upsell-ok">{tx.unlocked}</div>
          ) : upsellBuying && upsellPayment ? (
            <PaymentStatus
              payment={upsellPayment}
              productName={upsell.product.name}
              onSimulate={onSimulate && (upsellPayment.provider === "sandbox" || upsellPayment.provider === "preview") ? (s) => onSimulate(upsellPayment.id, s) : undefined}
              previewMode={previewMode}
            />
          ) : (
            <button
              className="btn btn-primary cta-glow"
              onClick={() => {
                setUpsellBuying(true);
                onBuyUpsell(upsell.productId);
              }}
            >
              {upsell.ctaLabel || tx.unlock}
            </button>
          )}
          {!boughtUpsell(upsell.productId) && (
            <button className="call-upsell-skip" onClick={closeUpsell}>
              {tx.notNow}
            </button>
          )}
        </div>
      )}

      <button className="call-btn decline call-hangup" onClick={onHangUp} aria-label={tx.hangUp}>
        <PhoneIcon down />
      </button>
    </div>
  );
}

const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;

/**
 * Ligação de voz do Cérebro: toca → o lead atende → o áudio gravado toca numa tela de chamada (cronômetro, mudo, desligar)
 * → "chamada encerrada". O áudio começa dentro do toque em "Atender" (o iPhone só libera som assim).
 */
export function VoiceCall({
  character,
  url,
  phase,
  endedSeconds,
  onAnswer,
  onDecline,
  onEnd,
}: {
  character: PublicCharacter;
  url: string;
  phase: "ringing" | "active" | "ended";
  endedSeconds?: number;
  onAnswer: () => void;
  onDecline: () => void;
  onEnd: (seconds: number) => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const started = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const ended = useRef(false);
  const { t } = useChatI18n();

  const finish = () => {
    if (ended.current) return;
    ended.current = true;
    audio.current?.pause();
    onEnd(Math.max(0, Math.round((Date.now() - started.current) / 1000)));
  };

  const accept = () => {
    const a = new Audio(url);
    a.preload = "auto";
    a.addEventListener("ended", () => setTimeout(finish, 700));
    audio.current = a;
    started.current = Date.now();
    a.play().catch(() => setBlocked(true));
    onAnswer();
  };

  useEffect(() => {
    if (phase !== "active") return;
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(iv);
  }, [phase]);
  // saiu da tela no meio da ligação: para o áudio
  useEffect(() => () => audio.current?.pause(), []);

  if (phase === "ringing") return <IncomingCall character={character} kind="voice" onAccept={accept} onDecline={onDecline} />;

  return (
    <div className={`call-overlay voice-call ${phase === "ended" ? "ended" : ""}`} role="dialog" aria-label={`${t.voiceCall} · ${character.name}`}>
      {character.avatarUrl && <div className="call-bg" style={{ backgroundImage: `url(${character.avatarUrl})` }} />}
      <div className="call-top">
        <div className="call-kind">{t.voiceCall}</div>
        <div className="call-avatar-wrap">
          {phase === "active" && !muted && <span className="voice-wave" />}
          {character.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="call-avatar" src={character.avatarUrl} alt="" />
          ) : (
            <div className="call-avatar">{character.name.slice(0, 1)}</div>
          )}
        </div>
        <div className="call-name">{character.name}</div>
        <div className="call-status voice-timer">{phase === "ended" ? `${t.callEnded} · ${fmt(endedSeconds ?? elapsed)}` : fmt(elapsed)}</div>
        {blocked && phase === "active" && (
          <button
            className="btn btn-primary voice-unblock"
            onClick={() => {
              setBlocked(false);
              audio.current?.play().catch(() => setBlocked(true));
            }}
          >
            {t.tapToHear}
          </button>
        )}
      </div>
      {phase === "active" && (
        <div className="call-actions voice-actions">
          <div>
            <button
              className={`call-btn mute ${muted ? "on" : ""}`}
              onClick={() => {
                const m = !muted;
                setMuted(m);
                if (audio.current) audio.current.muted = m;
              }}
              aria-label={muted ? t.muted : t.speaker}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            <span>{muted ? t.muted : t.speaker}</span>
          </div>
          <div>
            <button className="call-btn decline" onClick={finish} aria-label={t.hangUp}>
              <PhoneIcon down />
            </button>
            <span>{t.hangUp}</span>
          </div>
        </div>
      )}
    </div>
  );
}
