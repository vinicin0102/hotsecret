// Oferta em formato de chamada de vídeo: tela de ligação recebida e a chamada em andamento.
import { useEffect, useRef, useState } from "react";
import { formatBRL } from "@/lib/format";
import type { PublicCharacter, PublicProduct } from "@/types/flow";
import type { CallVideo, ChatTransport, PublicPaymentInfo } from "@/features/chat-engine/transport";
import { PaymentStatus } from "./PaymentStatus";

/** Toque de celular sintetizado (sem arquivo) + vibração, enquanto a chamada está tocando. */
function useRingtone(active: boolean) {
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

export function IncomingCall({ character, onAccept, onDecline }: { character: PublicCharacter; onAccept: () => void; onDecline: () => void }) {
  useRingtone(true);
  return (
    <div className="call-overlay ringing" role="dialog" aria-label={`Chamada de vídeo de ${character.name}`}>
      {character.avatarUrl && <div className="call-bg" style={{ backgroundImage: `url(${character.avatarUrl})` }} />}
      <div className="call-top">
        <div className="call-kind">📹 Chamada de vídeo</div>
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
          chamando<span className="dots">...</span>
        </div>
      </div>
      <div className="call-actions">
        <div>
          <button className="call-btn decline" onClick={onDecline} aria-label="Recusar">
            <PhoneIcon down />
          </button>
          <span>Recusar</span>
        </div>
        <div>
          <button className="call-btn accept" onClick={onAccept} aria-label="Atender">
            <CamIcon />
          </button>
          <span>Atender</span>
        </div>
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
}: {
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
  const live = useRef({ paid, upsell, boughtUpsell });
  live.current = { paid, upsell, boughtUpsell };

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

  // toca o trecho certo: FREE em loop até pagar; depois VIP (volta ao início do VIP no fim)
  useEffect(() => {
    const v = vRef.current;
    if (!v || !video) return;
    const range = paid ? video.vip : video.free;
    v.currentTime = range.start / 1000;
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
      const { paid, upsell, boughtUpsell } = live.current;
      if (v && video) {
        const ms = v.currentTime * 1000;
        const range = paid ? video.vip : video.free;
        if (ms >= range.end || ms < range.start - 300) v.currentTime = range.start / 1000;
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
            if (m.pause) v.pause();
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
    <div className="call-overlay active" role="dialog" aria-label="Chamada de vídeo">
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
          <div className="call-status">{video === undefined ? "conectando..." : "câmera indisponível"}</div>
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
          🔇 Toque para ouvir
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

      {!paid && (
        <div className="call-panel">
          <div className="call-panel-title">
            Para continuar a chamada
            {mainProduct && (
              <b>
                {" "}
                · {mainProduct.name} · {formatBRL(mainProduct.price)}
              </b>
            )}
          </div>
          {error && <div className="error-text">{error}</div>}
          {mainPayment ? (
            <PaymentStatus
              payment={mainPayment}
              productName={mainProduct?.name}
              onSimulate={onSimulate ? (s) => onSimulate(mainPayment.id, s) : undefined}
              previewMode={previewMode}
            />
          ) : (
            !error && <div className="hint">Gerando o PIX...</div>
          )}
        </div>
      )}

      {upsell && (
        <div className="call-upsell">
          <div className="call-upsell-text">{upsell.text || upsell.product.name}</div>
          <div className="call-upsell-price">
            {upsell.product.originalPrice && upsell.product.originalPrice > upsell.product.price ? (
              <s>{formatBRL(upsell.product.originalPrice)}</s>
            ) : null}{" "}
            {formatBRL(upsell.product.price)}
          </div>
          {boughtUpsell(upsell.productId) ? (
            <div className="call-upsell-ok">Desbloqueado ✓</div>
          ) : upsellBuying && upsellPayment ? (
            <PaymentStatus
              payment={upsellPayment}
              productName={upsell.product.name}
              onSimulate={onSimulate ? (s) => onSimulate(upsellPayment.id, s) : undefined}
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
              {upsell.ctaLabel || "DESBLOQUEAR"}
            </button>
          )}
          {!boughtUpsell(upsell.productId) && (
            <button className="call-upsell-skip" onClick={closeUpsell}>
              Agora não
            </button>
          )}
        </div>
      )}

      <button className="call-btn decline call-hangup" onClick={onHangUp} aria-label="Desligar">
        <PhoneIcon down />
      </button>
    </div>
  );
}
