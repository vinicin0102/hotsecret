import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { asChatLocale, ChatI18nContext, makeChatI18n } from "@/features/i18n/chat";
import type { AudioContent, DeliveryContent, ImageContent, LinkContent, OfferContent, PublicFunnel, VideoContent } from "@/types/flow";
import { getNode } from "@/features/chat-engine/engine";
import { useChatEngine, type ChatItem, type ResumeState } from "@/features/chat-engine/useChatEngine";
import type { ChatTransport } from "@/features/chat-engine/transport";
import { ChatHeader } from "./ChatHeader";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { OptionButtons } from "./OptionButtons";
import { AudioMessage, ImageMessage, VideoMessage } from "./MediaMessages";
import { OfferCard } from "./OfferCard";
import { TarotOffer } from "./TarotOffer";
import { CheckoutCard } from "./CheckoutCard";
import { PaymentStatus } from "./PaymentStatus";
import { DeliveryCard } from "./DeliveryCard";
import { CallScreen, IncomingCall, PixPopup, VoiceCall } from "./VideoCall";
import { Particles } from "./Particles";

interface Props {
  funnel: PublicFunnel;
  transport: ChatTransport | null;
  resume: ResumeState | null;
  embedded?: boolean;
  previewLabel?: string;
  onRestart?: () => void;
}

/**
 * Últimas mensagens na tela; a oferta ainda não comprada e o pagamento pendente mais recentes
 * continuam visíveis (o lead precisa conseguir comprar).
 */
function visibleItems(items: ChatItem[], count: number, isOpen: (i: ChatItem) => boolean): ChatItem[] {
  if (items.length <= count) return items;
  const tail = items.slice(-count);
  const pinned: ChatItem[] = [];
  for (const kind of ["offer", "checkout", "payment", "callAccess"] as const) {
    const last = [...items].reverse().find((i) => i.kind === kind);
    if (last && !tail.includes(last) && isOpen(last)) pinned.push(last);
  }
  pinned.sort((a, b) => items.indexOf(a) - items.indexOf(b));
  return [...pinned, ...tail];
}

export function ChatWindow({ funnel, transport, resume, embedded, previewLabel, onRestart }: Props) {
  const engine = useChatEngine(funnel, transport, resume);
  const i18n = useMemo(() => makeChatI18n(asChatLocale(funnel.locale)), [funnel.locale]);
  const { t } = i18n;
  const bgVideo = funnel.appearance?.bgVideoUrl || null;
  // com vídeo de fundo: só as últimas mensagens ficam na tela (as antigas vão sumindo)
  const fadeOld = !!bgVideo && funnel.appearance?.fadeOld !== false;
  const visibleCount = funnel.appearance?.visibleCount ?? 5;
  const { items, typing, awaiting, payments, ended } = engine;
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items.length, typing, awaiting]);

  // o lead digita nas perguntas abertas e nas opções configuradas para digitação
  const canType = awaiting?.kind === "open" || awaiting?.kind === "ai" || (awaiting?.kind === "buttons" && awaiting.inputMode !== "click");

  useEffect(() => {
    if (canType) inputRef.current?.focus({ preventScroll: true });
  }, [canType, awaiting]);

  const send = () => {
    if (!draft.trim()) return;
    engine.submitAnswer(draft);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const productOf = (offerNodeId: string | null | undefined) => {
    const node = getNode(engine.graph, offerNodeId);
    const pid = (node?.content as OfferContent | undefined)?.productId;
    return pid ? funnel.products[pid] : undefined;
  };


  const isOpenItem = (i: ChatItem) => {
    if (i.kind === "checkout" || i.kind === "callAccess") return true;
    if (i.kind === "payment") return ["CREATED", "PENDING"].includes(payments[i.paymentId]?.status ?? "");
    if (i.kind === "offer" && i.offer?.style === "tarot") return true; // a leitura do tarot fica sempre visível
    if (i.kind === "offer")
      return !Object.values(payments).some(
        (p) => p.offerNodeId === i.nodeId && p.status === "APPROVED" && (!i.productId || p.productId === i.productId),
      );
    return false;
  };

  const renderItem = (item: ChatItem) => {
    switch (item.kind) {
      case "message": {
        const c = item.content;
        if (item.type === "image") {
          const m = c as unknown as ImageContent;
          return (
            <MessageBubble key={item.id} sender={item.sender} at={item.at} media>
              <ImageMessage url={m.url} caption={m.caption} />
              {c.sending ? <div className="photo-sending">{t.sending}</div> : null}
            </MessageBubble>
          );
        }
        if (item.type === "video") {
          const m = c as unknown as VideoContent;
          return (
            <MessageBubble key={item.id} sender={item.sender} at={item.at} media>
              <VideoMessage
                {...m}
                loadOnce={m.viewOnce && item.nodeId && transport ? () => transport.viewOnce(item.nodeId!) : undefined}
                onPlay={() => engine.track("video_started", item.nodeId)}
              />
            </MessageBubble>
          );
        }
        if (item.type === "audio") {
          const m = c as unknown as AudioContent;
          return (
            <MessageBubble key={item.id} sender={item.sender} at={item.at}>
              <AudioMessage {...m} onPlay={() => engine.track("audio_played", item.nodeId)} />
            </MessageBubble>
          );
        }
        return (
          <MessageBubble key={item.id} sender={item.sender} at={item.at}>
            {String(c.text ?? "")}
          </MessageBubble>
        );
      }
      case "offer": {
        const node = getNode(engine.graph, item.nodeId);
        // ofertas do Cérebro trazem o produto escolhido pela IA
        const product = item.productId ? funnel.products[item.productId] : productOf(item.nodeId);
        const bought = Object.values(payments).some(
          (p) => p.offerNodeId === item.nodeId && p.status === "APPROVED" && (!item.productId || p.productId === item.productId),
        );
        const offer = item.offer ?? (node?.content as OfferContent) ?? { productId: "" };
        if (offer.style === "tarot" && item.productId) {
          const pid = item.productId;
          return (
            <TarotOffer
              key={item.id}
              offer={offer}
              product={product}
              bought={bought}
              onCta={() => engine.openCheckout(item.nodeId, pid)}
              loadCards={() => (transport ? transport.tarot(item.nodeId, pid) : Promise.resolve(null))}
            />
          );
        }
        return (
          <OfferCard
            key={item.id}
            offer={item.offer ?? (node?.content as OfferContent) ?? { productId: "" }}
            product={product}
            onCta={() => engine.openCheckout(item.nodeId, item.productId)}
            onVideoPlay={() => engine.track("video_started", item.nodeId)}
            disabled={bought}
          />
        );
      }
      case "checkout": {
        const product = item.productId ? funnel.products[item.productId] : productOf(item.nodeId);
        if (!product) return null;
        return (
          <CheckoutCard key={item.id} product={product} onSubmit={(form) => engine.submitCheckout(item.nodeId, { ...form, productId: item.productId })} />
        );
      }
      case "payment": {
        const p = payments[item.paymentId];
        return (
          <PaymentStatus
            key={item.id}
            payment={p}
            productName={(p && funnel.products[p.productId]?.name) ?? productOf(p?.offerNodeId)?.name}
            onRetry={p?.offerNodeId ? () => engine.openCheckout(p.offerNodeId!, getNode(engine.graph, p.offerNodeId)?.type === "ai" ? p.productId : undefined) : undefined}
            onSimulate={transport?.simulatePayment && (p?.provider === "sandbox" || p?.provider === "preview") ? (s) => engine.simulatePayment(item.paymentId, s) : undefined}
            previewMode={transport?.mode === "preview"}
          />
        );
      }
      case "delivery": {
        const node = getNode(engine.graph, item.nodeId);
        const c = (node?.content ?? {}) as DeliveryContent;
        return (
          <DeliveryCard
            key={item.id}
            label={c.buttonLabel}
            onOpen={async () => {
              engine.track("delivery_viewed", item.nodeId);
              if (!transport) throw new Error("Sem conexão");
              return transport.delivery(item.productId ?? c.productId);
            }}
          />
        );
      }
      case "link": {
        const node = getNode(engine.graph, item.nodeId);
        const c = (node?.content ?? {}) as LinkContent;
        return (
          <div key={item.id} className="msg-row bot">
            <a
              className="btn btn-primary"
              href={c.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => engine.track("link_clicked", item.nodeId)}
            >
              {c.buttonLabel || t.open}
            </a>
          </div>
        );
      }
      case "callAccess":
        return (
          <div key={item.id} className="msg-row bot">
            <div className="link-card call-access">
              <div className="hint">
                {t.callReadyA} {funnel.character.name} {t.callReadyB}
              </div>
              <button className="btn btn-gold cta-glow" style={{ marginTop: 6, minWidth: 240 }} onClick={() => engine.enterCall(item.nodeId, item.productId)}>
                {t.enterCall}
              </button>
            </div>
          </div>
        );
      case "call":
        return (
          <div key={item.id} className="msg-row system">
            <div className="bubble system">📹 Chamada de vídeo de {funnel.character.name}</div>
          </div>
        );
      case "recovery":
        return (
          <div key={item.id}>
            <MessageBubble sender="bot" at={item.at}>
              {item.text}
            </MessageBubble>
            {item.offerNodeId && (
              <div className="options">
                <button className="option-btn" onClick={() => engine.openCheckout(item.offerNodeId!)}>
                  {item.buttonLabel}
                </button>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <ChatI18nContext.Provider value={i18n}>
    <div className={`chat-shell ${embedded ? "embedded" : ""} ${bgVideo ? "has-bg-video" : ""}`} lang={i18n.locale}>
      {!embedded && <Particles />}
      <div className="chat-window">
        {bgVideo && (
          <>
            <video className="chat-bg-video" src={bgVideo} autoPlay muted loop playsInline preload="auto" disablePictureInPicture aria-hidden="true" />
            <div className="chat-bg-dim" style={{ background: `rgba(8, 4, 10, ${(funnel.appearance?.bgDim ?? 35) / 100})` }} />
          </>
        )}
        {previewLabel && <div className="preview-banner">{previewLabel}</div>}
        {engine.voice && (
          <VoiceCall
            key={engine.voice.id + engine.voice.nodeId}
            character={funnel.character}
            url={engine.voice.url}
            phase={engine.voice.phase}
            endedSeconds={engine.voice.seconds}
            onAnswer={engine.answerVoice}
            onDecline={engine.declineVoice}
            onEnd={(sec) => void engine.endVoice(sec)}
          />
        )}
        {engine.call?.phase === "ringing" && <IncomingCall character={funnel.character} onAccept={engine.answerCall} onDecline={engine.declineCall} />}
        {engine.call?.phase === "pix" && (
          <PixPopup
            character={funnel.character}
            product={funnel.products[engine.call.payProductId ?? ""]}
            payment={Object.values(payments)
              .filter((p) => p.offerNodeId === engine.call!.nodeId && p.productId === engine.call!.payProductId)
              .sort((a, b) => (a.status === "FAILED" ? 1 : 0) - (b.status === "FAILED" ? 1 : 0))[0]}
            downsell={engine.call.downsell}
            downsellText={(engine.call.offer ?? (getNode(engine.graph, engine.call.nodeId)?.content as OfferContent | undefined))?.downsellText}
            error={engine.callError}
            onClose={engine.hangUp}
            onSimulate={transport?.simulatePayment ? (id, s) => engine.simulatePayment(id, s) : undefined}
          />
        )}
        {engine.call?.phase === "active" && (
          <CallScreen
            nodeId={engine.call.nodeId}
            character={funnel.character}
            transport={transport}
            payments={payments}
            productId={engine.call.payProductId ?? engine.call.productId}
            mainProduct={funnel.products[engine.call.payProductId ?? engine.call.productId ?? ""] ?? productOf(engine.call.nodeId)}
            error={engine.callError}
            onHangUp={engine.hangUp}
            onBuyUpsell={engine.buyUpsell}
            onSimulate={transport?.simulatePayment ? (id, s) => engine.simulatePayment(id, s) : undefined}
            previewMode={transport?.mode === "preview"}
          />
        )}
        <ChatHeader character={funnel.character} typing={typing} />
        <div className={`chat-body ${fadeOld ? "fade-old" : ""}`} ref={bodyRef} aria-live="polite">
          {!bgVideo && <div className="day-sep">{t.today}</div>}
          {!bgVideo && (
          <div className="secret-note">
            🔒 {t.privateA} <b>{t.privateB}</b>. {t.privateC}
          </div>
          )}
          {(fadeOld ? visibleItems(items, visibleCount, isOpenItem) : items).map(renderItem)}
          {typing && <TypingIndicator />}
          {awaiting?.kind === "buttons" && awaiting.inputMode !== "type" && (
            <OptionButtons buttons={awaiting.buttons} onChoose={engine.chooseButton} />
          )}
          {ended && onRestart && (
            <div className="restart-bar">
              <button className="btn btn-ghost btn-sm" onClick={onRestart}>
                {t.restart}
              </button>
            </div>
          )}
        </div>
        <div className="composer">
          <input
            ref={photoRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void engine.sendPhoto(f);
            }}
          />
          <button
            type="button"
            className="photo-btn"
            aria-label={t.sendPhoto}
            title={t.takePhoto}
            disabled={!canType || engine.photoBusy}
            onClick={() => photoRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"
              />
            </svg>
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={!canType}
            placeholder={
              canType
                ? (awaiting?.placeholder ?? "") || t.typeAnswer
                : awaiting?.kind === "buttons"
                  ? t.chooseAbove
                  : t.message
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            maxLength={1000}
            enterKeyHint="send"
          />
          <button className="send" aria-label={t.send} disabled={!canType || !draft.trim()} onClick={send}>
            ➤
          </button>
        </div>
      </div>
    </div>
    </ChatI18nContext.Provider>
  );
}
