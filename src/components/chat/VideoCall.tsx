// Oferta em formato de chamada de vídeo: tela de ligação recebida e a chamada em andamento.
import { useEffect, useRef, useState } from "react";
import { useChatI18n } from "@/features/i18n/chat";
import type { PublicCharacter, PublicProduct } from "@/types/flow";
import type { CallVideo, ChatTransport, PayMethods, PayerData, PublicPaymentInfo } from "@/features/chat-engine/transport";
import { PaymentStatus } from "./PaymentStatus";
import { PayerForm } from "./PayerForm";
import { NextActionView } from "./NextAction";
import { UpsellScreen } from "./UpsellScreen";
import { VipMosaic } from "./VipPreviewCard";
import { withBase } from "@/lib/paths";
import { OfferCard } from "./OfferCard";
import { VipOfferModal, VipPaySheet } from "./LiveChannel";
import type { OfferContent } from "@/types/flow";

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
const SpeakerIcon = ({ off }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
    <path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" />
    {off ? (
      <path d="M16 9l5 6m0-6l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    ) : (
      <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    )}
  </svg>
);
const CamOffIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M17 10.5V7a1 1 0 0 0-1-1H8.8L17 14.2zM3.3 2.3 2 3.6 4.4 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.2 0 .4-.1.6-.2l3.8 3.8 1.3-1.3zM21 6.5l-4 4v.9l4 4z" />
  </svg>
);
/** sinal de conexão da chamada (4 barras) */
const SignalBars = () => (
  <span className="call-signal" aria-hidden="true">
    <i />
    <i />
    <i />
    <i />
  </span>
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

/** Pop-up só com o código PIX (copia e cola), ao atender ou depois do card do downsell. */
export function PixPopup({
  character,
  product,
  payment,
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
  const { t, money } = useChatI18n();
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
        <div className="pix-title">{`${character.name} ${t.waitingInCall}`}</div>
        {product && (
          <div className="pix-product">
            {product.name}
            <b>
              {product.originalPrice && product.originalPrice > product.price ? <s>{money(product.originalPrice, product.currency)}</s> : null}{" "}
              {money(product.price, product.currency)}
            </b>
          </div>
        )}
        <PixPayBody character={character} payment={payment} error={error} payerForm={payerForm} onSimulate={onSimulate} />
      </div>
    </div>
  );
}

/**
 * Recusou a chamada: o downsell aparece como card de oferta — o mesmo dos cards de compra do chat
 * (foto, selo, preço com desconto, botão) — com a fala da personagem em cima. O botão gera o PIX
 * no mesmo pop-up da compra principal.
 */
export function DownsellOffer({
  character,
  product,
  text,
  onBuy,
  onClose,
}: {
  character: PublicCharacter;
  product: PublicProduct | undefined;
  text?: string;
  onBuy: () => void;
  onClose: () => void;
}) {
  const { t } = useChatI18n();
  const [busy, setBusy] = useState(false);
  return (
    <div className="call-overlay pix down-offer" role="dialog" aria-label={product?.name ?? t.downsellDefault}>
      {character.avatarUrl && <div className="call-bg" style={{ backgroundImage: `url(${character.avatarUrl})` }} />}
      <button className="pix-close" onClick={onClose} aria-label={t.close}>
        ✕
      </button>
      <div className="down-wrap">
        <div className="down-say">
          {character.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="down-avatar" src={character.avatarUrl} alt="" />
          ) : (
            <div className="down-avatar">{character.name.slice(0, 1)}</div>
          )}
          <div className="down-bubble">
            <b>{character.name}</b>
            {text || t.downsellDefault}
          </div>
        </div>
        <OfferCard
          offer={{ productId: product?.id ?? "" }}
          product={product}
          disabled={busy}
          onCta={() => {
            setBusy(true);
            onBuy();
          }}
        />
      </div>
    </div>
  );
}

/** corpo do pagamento (dados do comprador → gerando → código PIX para copiar / dados do gateway → aguardando) */
export function PixPayBody({
  character,
  payment,
  error,
  payerForm,
  onSimulate,
  doneStep,
}: {
  character: PublicCharacter;
  payment: PublicPaymentInfo | undefined;
  error: string | null;
  /** último passo ("a chamada começa sozinha…" por padrão) */
  doneStep?: string;
  payerForm?: {
    loadMethods: () => Promise<PayMethods | null>;
    initial: PayerData | null;
    onSubmit: (payer: PayerData) => Promise<unknown>;
  };
  onSimulate?: (paymentId: string, status: "APPROVED" | "FAILED") => void;
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
    <>
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
            <li>{doneStep ?? t.step3}</li>
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
            <li>{doneStep ?? t.step3}</li>
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
    </>
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
  freePreview,
  onBuyMain,
}: {
  /** chamada de vídeo 02: antes de pagar, o trecho FREE toca uma vez e no fim dele aparece a oferta (como upsell) */
  freePreview?: boolean;
  /** chamada de vídeo 02: o lead tocou em pagar a oferta principal (ou um ingresso de uma "Oferta" no FREE) */
  onBuyMain?: (productId?: string) => void;
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
  const [soundOff, setSoundOff] = useState(false);
  /** corações que o lead manda tocando no ♥ (sobem pela tela) */
  const [hearts, setHearts] = useState<{ id: number; x: number; d: number }[]>([]);
  const shown = useRef(new Set<string>());

  const forNode = Object.values(payments).filter((p) => p.offerNodeId === nodeId);
  const mainPayments = forNode.filter((p) => p.productId === mainProduct?.id);
  // "Oferta" marcada no FREE (chamada de vídeo 02): pagar qualquer um dos ingressos também libera a chamada
  // (sem "Oferta" no FREE, a primeira "Oferta" do vídeo é a do fim do FREE)
  const freeZone = (video?.markers ?? []).filter((m) => m.style === "offer" && m.at < video!.vip.start);
  const freeOfferIds = new Set(
    (freeZone.length ? freeZone : (video?.markers ?? []).filter((m) => m.style === "offer").slice(0, 1))
      .flatMap((m) => [m.productId, m.basicProductId ?? ""])
      .filter(Boolean),
  );
  const paid = forNode.some((p) => p.status === "APPROVED" && (p.productId === mainProduct?.id || freeOfferIds.has(p.productId)));
  const mainPayment = mainPayments.sort((a, b) => (a.status === "APPROVED" ? -1 : b.status === "APPROVED" ? 1 : 0))[0];
  const boughtUpsell = (pid: string) => forNode.some((p) => p.productId === pid && p.status === "APPROVED");
  const upsellPayment = upsell ? forNode.find((p) => p.productId === upsell.productId && p.status !== "FAILED") : undefined;
  const upsellDone = upsell ? boughtUpsell(upsell.productId) || (!!upsell.basicProductId && boughtUpsell(upsell.basicProductId)) : false;
  /** "Oferta" com 2 ingressos: o ingresso escolhido (abre a folha do pagamento) */
  const [offerPick, setOfferPick] = useState<string | null>(null);
  useEffect(() => setOfferPick(null), [upsell?.id]);
  // o loop de animação lê sempre o estado atual por aqui
  /** já viu o FREE (chamada de vídeo 02): depois de pagar, segue direto do VIP */
  const sawFree = useRef(false);
  if (freePreview) sawFree.current = true;
  /** o FREE acabou e a "Oferta" marcada está na tela: fechar desliga (não há mais nada grátis para ver) */
  const freeEnded = useRef(false);
  /** sem "Oferta" no vídeo: o upgrade do fim do FREE usa o produto da chamada */
  const mainOfferMarker = useRef<CallVideo["markers"][number] | null>(null);
  mainOfferMarker.current = mainProduct
    ? { id: "main", at: 0, label: mainProduct.name, productId: mainProduct.id, style: "offer", product: mainProduct }
    : null;
  const live = useRef({ paid, upsell, boughtUpsell, freePreview });
  live.current = { paid, upsell, boughtUpsell, freePreview };

  // chamada de vídeo 02: ao atender, o trecho FREE já toca (uma vez)
  useEffect(() => {
    const v = vRef.current;
    if (!v || !video || paid || !freePreview) return;
    v.currentTime = video.free.start / 1000;
    v.muted = false;
    v.play().catch(() => {
      v.muted = true;
      setNeedsTap(true);
      setSoundOff(true);
      void v.play().catch(() => undefined);
    });
  }, [video, paid, freePreview]);

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
      setSoundOff(true);
      void v.play().catch(() => undefined);
    });
  }, [video, paid]);

  useEffect(() => {
    let raf = 0;
    let lastT = -1;
    const loop = () => {
      const v = vRef.current;
      const { paid, upsell, boughtUpsell, freePreview } = live.current;
      if (v && video) {
        const ms = v.currentTime * 1000;
        if (!paid && freePreview) {
          // "Oferta" marcada no FREE (qualquer ponto antes do VIP, como aparece no editor)
          const zone = video.markers.filter((mk) => mk.style === "offer" && mk.at < video.vip.start);
          // no meio do FREE: o vídeo para e o upgrade abre
          const fo = !upsell ? zone.find((mk) => mk.at < video.free.end && !shown.current.has(mk.id) && ms >= mk.at && ms - mk.at < 1500) : undefined;
          if (fo) {
            shown.current.add(fo.id);
            setUpsell(fo);
            setUpsellBuying(false);
            v.pause();
          }
          // fim do FREE: o vídeo para e abre o upgrade — a "Oferta" do FREE; senão a primeira "Oferta" do vídeo
          // (no VIP ela nunca seria vista antes de pagar); sem nenhuma, o upgrade com o produto da chamada
          if (ms >= video.free.end || v.ended) {
            if (!v.paused) v.pause();
            freeEnded.current = true;
            if (!upsell) {
              const end = zone[zone.length - 1] ?? video.markers.find((mk) => mk.style === "offer") ?? mainOfferMarker.current;
              if (end) {
                shown.current.add(end.id);
                setUpsell(end);
                setUpsellBuying(false);
              }
            }
          }
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
            // tela cheia e oferta: o vídeo para por baixo
            if (m.pause || m.style === "screen" || m.style === "offer" || m.style === "vip") v.pause();
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
    // upsell "Grupo VIP": fica aberto com o botão "Abrir meu VIP" (ele volta para a chamada quando quiser)
    if (!upsellDone || upsell?.style === "vip") return;
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
  const toggleSound = () => {
    const v = vRef.current;
    const off = !soundOff;
    if (v) {
      v.muted = off;
      if (!off) void v.play().catch(() => undefined);
    }
    setSoundOff(off);
    setNeedsTap(false);
  };
  const sendHeart = () => {
    const id = Date.now() + Math.random();
    setHearts((h) => [...h.slice(-11), { id, x: Math.round(Math.random() * 40 - 20), d: 2 + Math.random() * 0.8 }]);
    setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 3000);
  };
  const cues = video ? video.chat.filter((c) => t >= c.start && t < c.end) : [];
  const mm = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="call-overlay active" role="dialog" aria-label={tx.videoCall}>
      {video ? (
        <video
          ref={vRef}
          className="call-video"
          style={video.frame ? { objectFit: video.frame.fit, objectPosition: `${video.frame.x}% ${video.frame.y}%` } : undefined}
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
          <div className="call-connecting-inner">
            {character.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="call-avatar" src={character.avatarUrl} alt="" />
            ) : (
              <div className="call-avatar">{character.name.slice(0, 1)}</div>
            )}
            <div className="call-status">{video === undefined ? tx.connecting : tx.cameraOff}</div>
          </div>
        </div>
      )}
      <div className="call-shade" aria-hidden="true" />
      <div className="call-hud">
        <div className="call-who">
          {character.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={character.avatarUrl} alt="" />
          ) : (
            <span className="call-who-initial">{character.name.slice(0, 1)}</span>
          )}
          <div>
            <b>{character.name}</b>
            <small>
              <span className="live-pill">
                <span className="live-dot" /> {tx.liveBadge}
              </span>
              <span className="call-time">{mm}</span>
              <SignalBars />
            </small>
          </div>
        </div>
        <div className="call-self" title={`${tx.you} · ${tx.yourCamOff}`}>
          <CamOffIcon />
          <span>{tx.you}</span>
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

      {upsell && upsell.style === "offer" && (() => {
        const offer: OfferContent = { productId: upsell.productId, downsellProductId: upsell.basicProductId, style: "live", vip: upsell.vip };
        const inFree = !paid && !!freePreview;
        return offerPick ? (
          <VipPaySheet
            character={character}
            offer={offer}
            payment={forNode.filter((p) => p.productId === offerPick && p.status !== "FAILED")[0]}
            error={error}
            onClose={() => {
              setOfferPick(null);
              if (inFree && freeEnded.current) onHangUp();
              else closeUpsell();
            }}
            onSimulate={onSimulate}
          />
        ) : (
          <VipOfferModal
            offer={offer}
            product={upsell.product as PublicProduct}
            basic={upsell.basicProduct as PublicProduct | undefined}
            onPick={(pid) => {
              setOfferPick(pid);
              setUpsellBuying(true);
              if (inFree) onBuyMain?.(pid);
              else onBuyUpsell(pid);
            }}
            onClose={inFree && freeEnded.current ? onHangUp : closeUpsell}
          />
        );
      })()}
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
          onSimulate={onSimulate}
        />
      )}
      {upsell && upsell.style === "vip" && upsell.vipCard && (
        <VipUpsell
          key={upsell.id}
          marker={upsell}
          character={character}
          payment={upsellPayment}
          bought={boughtUpsell(upsell.productId)}
          error={error}
          onBuy={() => {
            setUpsellBuying(true);
            onBuyUpsell(upsell.productId);
          }}
          onSimulate={onSimulate}
          onContinue={closeUpsell}
        />
      )}
      {upsell && upsell.style !== "screen" && upsell.style !== "offer" && upsell.style !== "vip" && (
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
        </div>
      )}

      <div className="call-hearts" aria-hidden="true">
        {hearts.map((h) => (
          <span key={h.id} style={{ "--x": `${h.x}px`, "--d": `${h.d}s` } as React.CSSProperties}>
            ♥
          </span>
        ))}
      </div>
      <div className="call-controls">
        <button className={`call-ctl ${soundOff ? "off" : ""}`} onClick={toggleSound} aria-label={soundOff ? tx.soundOff : tx.soundOn} aria-pressed={!soundOff}>
          <SpeakerIcon off={soundOff} />
        </button>
        <button className="call-btn decline call-hangup" onClick={onHangUp} aria-label={tx.hangUp}>
          <PhoneIcon down />
        </button>
        <button className="call-ctl heart" onClick={sendHeart} aria-label={tx.sendHeart}>
          ♥
        </button>
      </div>
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
  offer,
  product,
  endText,
  onBuy,
  onClose,
  pay,
  payment,
  payerForm,
  onSimulate,
}: {
  character: PublicCharacter;
  url: string;
  phase: "ringing" | "active" | "ended";
  endedSeconds?: number;
  onAnswer: () => void;
  onDecline: () => void;
  onEnd: (seconds: number) => void;
  /** oferta do fim da ligação: o botão aparece aqui mesmo, na tela da chamada encerrada */
  offer?: { headline?: string; ctaLabel?: string; previewUrl?: string; previewTitle?: string };
  product?: PublicProduct;
  endText?: string;
  onBuy?: () => void;
  onClose?: () => void;
  /** tocou no botão: o PIX é gerado aqui mesmo */
  pay?: { needPayer: boolean; error?: string };
  payment?: PublicPaymentInfo;
  payerForm?: {
    loadMethods: () => Promise<PayMethods | null>;
    initial: PayerData | null;
    onSubmit: (payer: PayerData) => Promise<unknown>;
  };
  onSimulate?: (paymentId: string, status: "APPROVED" | "FAILED") => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const started = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const ended = useRef(false);
  const { t, money } = useChatI18n();

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
    <div className={`call-overlay voice-call ${phase === "ended" ? "ended" : ""} ${pay ? "paying" : ""}`} role="dialog" aria-label={`${t.voiceCall} · ${character.name}`}>
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
      {phase === "ended" && offer && product && (
        <div className={`voice-offer ${pay ? "paying" : ""}`} role="group" aria-label={offer.headline || product.name}>
          {offer.previewUrl && !pay && (
            <div className="voice-offer-preview">
              {/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(offer.previewUrl) ? (
                <video src={offer.previewUrl} autoPlay muted loop playsInline disablePictureInPicture onClick={(e) => (e.currentTarget.muted = !e.currentTarget.muted)} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={offer.previewUrl} alt="" />
              )}
              <span className="live-badge voice-offer-live">● {t.liveBadge}</span>
              {offer.previewTitle && <div className="voice-offer-preview-title">{offer.previewTitle}</div>}
            </div>
          )}
          {endText && !pay && <p className="voice-offer-text">{endText}</p>}
          <div className="voice-offer-card">
            {product.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="voice-offer-img" src={product.imageUrl} alt="" />
            )}
            <div className="voice-offer-info">
              <div className="voice-offer-name">{offer.headline || product.name}</div>
              <div className="voice-offer-price">
                {product.originalPrice && product.originalPrice > product.price ? <s>{money(product.originalPrice, product.currency)}</s> : null}
                <b>{money(product.price, product.currency)}</b>
              </div>
            </div>
          </div>
          {pay ? (
            <div className="voice-pay">
              <PixPayBody character={character} payment={payment} error={pay.error ?? null} payerForm={pay.needPayer ? payerForm : undefined} onSimulate={onSimulate} doneStep={t.buyingB} />
            </div>
          ) : (
            <button className="voice-offer-btn" onClick={onBuy}>
              {offer.ctaLabel || t.wantAccess}
            </button>
          )}
          <button className="voice-offer-skip" onClick={onClose}>
            {t.upNotNow}
          </button>
        </div>
      )}
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

/**
 * Upsell "Grupo VIP" na chamada: o vídeo para e abre o mesmo upgrade da "Oferta" (selo, título, benefícios ⭐,
 * de/por e o botão) com o mosaico do grupo; tocou em comprar, a mesma folha do PIX da Oferta. Pagou: "Desbloqueado ✓",
 * botão para abrir o VIP (já liberado, numa aba nova) e para voltar à chamada.
 */
function VipUpsell({
  marker,
  character,
  payment,
  bought,
  error,
  onBuy,
  onSimulate,
  onContinue,
}: {
  marker: CallVideo["markers"][number];
  character: PublicCharacter;
  payment: PublicPaymentInfo | undefined;
  bought: boolean;
  error: string | null;
  onBuy: () => void;
  onSimulate?: (paymentId: string, status: "APPROVED" | "FAILED") => void;
  onContinue: () => void;
}) {
  const { t } = useChatI18n();
  const [paying, setPaying] = useState(false);
  const card = marker.vipCard!;
  const p = marker.product;
  // textos do upgrade: os do grupo (benefícios da assinatura + quantas fotos/vídeos)
  const offer: OfferContent = {
    productId: p.id,
    style: "live",
    vip: {
      badge: t.vipUpsellTag,
      title: marker.text || card.headline || t.vipUpsellText,
      highlight: card.name,
      // escritos no upsell (editor de vídeo); vazio: quantas fotos/vídeos + os benefícios do grupo
      intro: marker.vip?.intro?.trim() || t.vipGroupIntro,
      benefits: (marker.vip?.benefits ?? []).map((b) => b.trim()).filter(Boolean).length
        ? (marker.vip?.benefits ?? []).map((b) => b.trim()).filter(Boolean)
        : [t.vipGroupCount.replace("{f}", String(card.counts.images)).replace("{v}", String(card.counts.videos)), ...card.perks],
      completeLabel: marker.ctaLabel || t.vipUnlockCta,
      payTitle: t.vipPixTitle,
      paySubtitle: card.name,
    },
  };
  if (bought) {
    return (
      <div className="vip-sheet vipu-done-sheet" role="dialog" aria-label={t.unlocked}>
        <div className="vip-sheet-title">🔓 {t.unlocked}</div>
        <div className="vip-sheet-sub">{card.name}</div>
        {marker.vipUrl && (
          <a className="vip-copy vipu-open" href={withBase(marker.vipUrl)} target="_blank" rel="noopener">
            {t.vipOpen} →
          </a>
        )}
        <button className="vipu-back" onClick={onContinue}>
          {t.vipBackToCall}
        </button>
      </div>
    );
  }
  if (paying) {
    return <VipPaySheet character={character} offer={offer} payment={payment} error={error} onClose={onContinue} onSimulate={onSimulate} />;
  }
  return (
    <VipOfferModal
      offer={offer}
      product={p as PublicProduct}
      basic={undefined}
      media={<VipMosaic card={card} />}
      onPick={() => {
        setPaying(true);
        onBuy();
      }}
      onClose={onContinue}
    />
  );
}
