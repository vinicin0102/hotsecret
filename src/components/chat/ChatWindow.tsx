import { useEffect, useRef, useState, type KeyboardEvent } from "react";
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
import { CheckoutCard } from "./CheckoutCard";
import { PaymentStatus } from "./PaymentStatus";
import { DeliveryCard } from "./DeliveryCard";
import { Particles } from "./Particles";

interface Props {
  funnel: PublicFunnel;
  transport: ChatTransport | null;
  resume: ResumeState | null;
  embedded?: boolean;
  previewLabel?: string;
  onRestart?: () => void;
}

export function ChatWindow({ funnel, transport, resume, embedded, previewLabel, onRestart }: Props) {
  const engine = useChatEngine(funnel, transport, resume);
  const { items, typing, awaiting, payments, ended } = engine;
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items.length, typing, awaiting]);

  // o lead digita nas perguntas abertas e nas opções configuradas para digitação
  const canType = awaiting?.kind === "open" || (awaiting?.kind === "buttons" && awaiting.inputMode !== "click");

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

  const hasPaymentFor = (nodeId: string) =>
    Object.values(payments).some((p) => p.offerNodeId === nodeId && p.status !== "FAILED");

  const renderItem = (item: ChatItem) => {
    switch (item.kind) {
      case "message": {
        const c = item.content;
        if (item.type === "image") {
          const m = c as unknown as ImageContent;
          return (
            <MessageBubble key={item.id} sender={item.sender} at={item.at} media>
              <ImageMessage url={m.url} caption={m.caption} />
            </MessageBubble>
          );
        }
        if (item.type === "video") {
          const m = c as unknown as VideoContent;
          return (
            <MessageBubble key={item.id} sender={item.sender} at={item.at} media>
              <VideoMessage {...m} onPlay={() => engine.track("video_started", item.nodeId)} />
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
        return (
          <OfferCard
            key={item.id}
            offer={(node?.content as OfferContent) ?? { productId: "" }}
            product={productOf(item.nodeId)}
            onCta={() => engine.openCheckout(item.nodeId)}
            disabled={hasPaymentFor(item.nodeId) && Object.values(payments).some((p) => p.offerNodeId === item.nodeId && p.status === "APPROVED")}
          />
        );
      }
      case "checkout": {
        const product = productOf(item.nodeId);
        if (!product) return null;
        return <CheckoutCard key={item.id} product={product} onSubmit={(form) => engine.submitCheckout(item.nodeId, form)} />;
      }
      case "payment": {
        const p = payments[item.paymentId];
        return (
          <PaymentStatus
            key={item.id}
            payment={p}
            productName={productOf(p?.offerNodeId)?.name}
            onRetry={p?.offerNodeId ? () => engine.openCheckout(p.offerNodeId!) : undefined}
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
              return transport.delivery(c.productId);
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
              {c.buttonLabel || "Abrir"}
            </a>
          </div>
        );
      }
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
    <div className={`chat-shell ${embedded ? "embedded" : ""}`}>
      {!embedded && <Particles />}
      <div className="chat-window">
        {previewLabel && <div className="preview-banner">{previewLabel}</div>}
        <ChatHeader character={funnel.character} typing={typing} />
        <div className="chat-body" ref={bodyRef} aria-live="polite">
          <div className="day-sep">Hoje</div>
          <div className="secret-note">
            🔒 Esta conversa é <b>privada</b>. Só você está vendo.
          </div>
          {items.map(renderItem)}
          {typing && <TypingIndicator />}
          {awaiting?.kind === "buttons" && awaiting.inputMode !== "type" && (
            <OptionButtons buttons={awaiting.buttons} onChoose={engine.chooseButton} />
          )}
          {ended && onRestart && (
            <div className="restart-bar">
              <button className="btn btn-ghost btn-sm" onClick={onRestart}>
                ↺ Recomeçar conversa
              </button>
            </div>
          )}
        </div>
        <div className="composer">
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            disabled={!canType}
            placeholder={
              canType
                ? (awaiting?.placeholder ?? "") || "Digite sua resposta..."
                : awaiting?.kind === "buttons"
                  ? "Escolha uma opção acima"
                  : "Mensagem"
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            maxLength={1000}
            enterKeyHint="send"
          />
          <button className="send" aria-label="Enviar" disabled={!canType || !draft.trim()} onClick={send}>
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
