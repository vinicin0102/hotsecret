// Executa o fluxo no navegador: percorre os nós em sequência, mostra "digitando", aguarda
// respostas/cliques, abre o checkout e avança somente quando o servidor confirma o pagamento.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AiContent, AnswerInputMode, ChoiceButton, FlowGraph, FlowNode, OfferContent, PublicFunnel, TarotCard } from "@/types/flow";
import { AI_OFFERS_OUT, autoDelay, getNode, findStartNode, matchChoice, nextNodeId, resolveDelay, unlockedByOffers } from "./engine";
import { ApiError, type ChatTransport, type CheckoutForm, type PayerData, type PublicPaymentInfo, type ServerMessage } from "./transport";
import { pixelInitiateCheckout, pixelPurchase } from "./pixels";
import { compressPhoto } from "./photo";
import { asChatLocale, chatTexts } from "@/features/i18n/chat";

export type ChatItem =
  | { kind: "message"; id: string; sender: "bot" | "user" | "system"; type: "text" | "image" | "video" | "audio"; content: Record<string, unknown>; nodeId?: string | null; at: string }
  // productId/offer: ofertas mostradas pelo Cérebro (IA)
  | { kind: "offer"; id: string; nodeId: string; at: string; productId?: string; offer?: OfferContent }
  | { kind: "checkout"; id: string; nodeId: string; at: string; productId?: string }
  | { kind: "payment"; id: string; paymentId: string; at: string }
  | { kind: "delivery"; id: string; nodeId: string; at: string; productId?: string }
  | { kind: "link"; id: string; nodeId: string; at: string }
  | { kind: "call"; id: string; nodeId: string; at: string }
  /** chamada paga: botão para entrar (ou voltar) na chamada */
  | { kind: "callAccess"; id: string; nodeId: string; productId: string; at: string }
  | { kind: "recovery"; id: string; text: string; buttonLabel: string; offerNodeId: string | null; at: string };

export type Awaiting =
  | null
  | { kind: "buttons"; nodeId: string; buttons: ChoiceButton[]; inputMode: AnswerInputMode; placeholder?: string }
  | { kind: "open"; nodeId: string; placeholder?: string }
  | { kind: "ai"; nodeId: string; placeholder?: string };

export interface ResumeState {
  resumed: boolean;
  conversation: { status: string; currentNodeId: string | null };
  messages: ServerMessage[];
  payments: PublicPaymentInfo[];
}

function buttonsAwaiting(nodeId: string, c: Record<string, unknown>): Awaiting {
  return {
    kind: "buttons",
    nodeId,
    buttons: (c.buttons as ChoiceButton[]) ?? [],
    inputMode: (c.inputMode as AnswerInputMode) ?? "type",
    placeholder: (c.placeholder as string) || undefined,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let localSeq = 0;
const lid = () => `l${++localSeq}_${Date.now().toString(36)}`;
const now = () => new Date().toISOString();

/** hold: o fluxo só começa quando virar false (Canal VIP AO VIVO: depois de atender a ligação da entrada) */
export function useChatEngine(funnel: PublicFunnel, transport: ChatTransport | null, resume: ResumeState | null, opts: { hold?: boolean } = {}) {
  const hold = !!opts.hold;
  const tx = chatTexts(asChatLocale(funnel.locale));
  // o grafo público chega sem o conteúdo pago; ele é mesclado após o pagamento aprovado
  const [graph, setGraph] = useState<FlowGraph>(funnel.graph);
  const graphRef = useRef<FlowGraph>(funnel.graph);
  const funnelProducts = useRef(funnel.products);
  funnelProducts.current = funnel.products;
  const unlocking = useRef<Promise<void> | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [typing, setTyping] = useState(false);
  const [awaiting, setAwaiting] = useState<Awaiting>(null);
  const [payments, setPayments] = useState<Record<string, PublicPaymentInfo>>({});
  const paymentsRef = useRef(payments);
  paymentsRef.current = payments;
  const [ended, setEnded] = useState(false);
  const [checkoutOpened, setCheckoutOpened] = useState(false);
  /** chamada de vídeo: tocando (ringing) ou em andamento (active) */
  /** productId/offer: chamada de uma oferta do Cérebro (IA) */
  /**
   * Chamada de vídeo: ringing (tocando) → pix (pop-up só com o código PIX do produto principal ou do downsell)
   * → active (vídeo, liberado só depois do pagamento). productId/offer: oferta do Cérebro.
   */
  /** ligação de voz do Cérebro: tocando → em andamento (áudio) → encerrada */
  const [voice, setVoice] = useState<{ nodeId: string; id: string; url: string; phase: "ringing" | "active" | "ended"; seconds?: number } | null>(null);
  const [call, setCall] = useState<{
    nodeId: string;
    phase: "ringing" | "pix" | "active";
    productId?: string;
    offer?: OfferContent;
    /** produto que está sendo pago no pop-up */
    payProductId?: string;
    downsell?: boolean;
    /** o gateway pede os dados do comprador antes de gerar o pagamento */
    needPayer?: boolean;
    /** chamada de vídeo 02: a chamada já está aberta com o FREE em loop e o PIX por cima, até pagar */
    free?: boolean;
  } | null>(null);
  /**
   * Canal VIP AO VIVO: offer (upgrade com 2 ingressos) → pay (folha do pagamento, chat visível acima)
   * → exit (pop-up "vai desistir agora?" ao tentar fechar). productId/offer: oferta do Cérebro.
   */
  const [vip, setVip] = useState<{
    nodeId: string;
    phase: "offer" | "pay" | "exit";
    productId?: string;
    offer?: OfferContent;
    payProductId?: string;
    needPayer?: boolean;
  } | null>(null);
  const [vipError, setVipError] = useState<string | null>(null);
  /** mensagens de conversão já disparadas (uma vez por oferta) */
  const vipPushed = useRef(new Set<string>());
  /** dados do comprador já informados nesta conversa (só em memória; reaproveitados no downsell/upsell) */
  const [payer, setPayer] = useState<PayerData | null>(null);
  const payerRef = useRef<PayerData | null>(null);
  /** produtos comprados como upsell dentro da chamada (não seguem o ramo da oferta principal) */
  const upsellProducts = useRef(new Set<string>());
  /** produtos pagos pelo pop-up da chamada: a entrega é o próprio vídeo (sem botão de acesso no chat) */
  const callProducts = useRef(new Set<string>());
  /** produtos de ofertas de tarot do Cérebro: o acesso é a revelação das cartas (sem botão "Acessar") */
  const tarotProducts = useRef(new Set<string>());

  const runId = useRef(0);
  /** ofertas exibidas com mensagens de apoio rodando (param no clique em comprar ou na aprovação) */
  const followUpOffers = useRef(new Set<string>());
  const started = useRef(false);
  const chatStartedSent = useRef(false);
  const advancedPayments = useRef(new Set<string>());
  const lastPoll = useRef<string | null>(null);
  const seenServerMsgs = useRef(new Set<string>());
  const transportRef = useRef(transport);
  transportRef.current = transport;

  /** Busca no servidor o conteúdo pago liberado (apenas com pagamento aprovado). */
  const ensureUnlocked = useCallback(async () => {
    const t = transportRef.current;
    if (!t) return;
    if (!unlocking.current) {
      unlocking.current = t
        .unlock()
        .then((nodes) => {
          if (!nodes.length) return;
          const byId = new Map(nodes.map((n) => [n.id, n]));
          const next = { ...graphRef.current, nodes: graphRef.current.nodes.map((n) => byId.get(n.id) ?? n) };
          graphRef.current = next;
          setGraph(next);
        })
        .catch(() => undefined)
        .finally(() => {
          unlocking.current = null;
        });
    }
    await unlocking.current;
  }, []);

  const track = useCallback((type: string, nodeId?: string | null, data?: Record<string, unknown>) => {
    transportRef.current?.track([{ type, nodeId: nodeId ?? null, data }]);
  }, []);

  const push = useCallback((item: ChatItem) => setItems((prev) => [...prev, item]), []);

  const markChatStarted = useCallback(() => {
    if (chatStartedSent.current) return;
    chatStartedSent.current = true;
    track("chat_started");
  }, [track]);

  const wait = useCallback(async (node: FlowNode, token: number, fallbackTyping = true) => {
    const c = node.content as unknown as Record<string, unknown>;
    const textLength = String(c.text ?? c.caption ?? "").length;
    const ms = resolveDelay(node.settings, funnel.delay, textLength);
    const showTyping = node.settings?.showTyping ?? fallbackTyping;
    if (showTyping && ms > 0) setTyping(true);
    await sleep(ms);
    if (runId.current === token) setTyping(false);
    return runId.current === token;
  }, []);

  const aiTurnRef = useRef<(nodeId: string, text: string | null, event?: "call_declined" | "photo" | "continue" | "voice_declined") => Promise<void>>(async () => undefined);
  /** blocos Cérebro que já conversaram nesta sessão (voltar para eles = a IA continua a conversa) */
  const aiTalked = useRef(new Set<string>());
  /** última resposta do lead fora da IA (botão ou texto) — a IA responde a ela ao voltar para o bloco */
  const lastAnswer = useRef<string | null>(null);

  /** Percorre o fluxo a partir de um nó até encontrar um ponto de espera. */
  const run = useCallback(
    async (startId: string | null) => {
      const token = ++runId.current;
      let id = startId;
      let guard = 0;
      while (id && guard++ < 300) {
        if (runId.current !== token) return;
        let node = getNode(graphRef.current, id);
        if (node?.locked) {
          await ensureUnlocked();
          if (runId.current !== token) return;
          node = getNode(graphRef.current, id);
        }
        if (!node || node.locked) break;
        if (node.type !== "start") track("node_entered", node.id);
        const c = node.content as unknown as Record<string, unknown>;

        switch (node.type) {
          case "start":
            id = nextNodeId(graphRef.current, node.id);
            continue;

          case "text":
          case "image":
          case "video":
          case "audio": {
            const isUser = node.type === "text" && c.sender === "user";
            if (!(await wait(node, token, !isUser))) return;
            push({ kind: "message", id: lid(), sender: isUser ? "user" : "bot", type: node.type, content: c, nodeId: node.id, at: now() });
            track("message_viewed", node.id);
            if (node.type === "image") track("image_viewed", node.id);
            markChatStarted();
            id = nextNodeId(graphRef.current, node.id);
            continue;
          }

          case "buttons":
          case "question": {
            const text = (c.text as string) || "";
            if (text) {
              if (!(await wait(node, token))) return;
              push({ kind: "message", id: lid(), sender: "bot", type: "text", content: { text }, nodeId: node.id, at: now() });
              markChatStarted();
            } else {
              await sleep(Math.min(resolveDelay(node.settings, funnel.delay, 0), 1500));
              if (runId.current !== token) return;
            }
            track("message_viewed", node.id);
            if (node.type === "question" && c.mode === "open") {
              setAwaiting({ kind: "open", nodeId: node.id, placeholder: (c.placeholder as string) || undefined });
            } else {
              setAwaiting(buttonsAwaiting(node.id, c));
            }
            return;
          }

          case "offer": {
            if (!(await wait(node, token))) return;
            if ((c as unknown as OfferContent).style === "call") {
              // chamada de vídeo recebida: a tela de ligação aparece por cima do chat
              push({ kind: "call", id: lid(), nodeId: node.id, at: now() });
              setCall({ nodeId: node.id, phase: "ringing" });
              track("offer_viewed", node.id);
              markChatStarted();
              return;
            }
            push({ kind: "offer", id: lid(), nodeId: node.id, at: now() });
            track("offer_viewed", node.id);
            markChatStarted();
            // Canal VIP AO VIVO: o upgrade abre por cima do chat (o card fica no chat para reabrir)
            if ((c as unknown as OfferContent).style === "live") setVip({ nodeId: node.id, phase: "offer" });
            // "Enquanto não compra": mensagens/áudios de apoio logo após o card (quebra de objeções)
            const followUp = nextNodeId(graphRef.current, node.id, "default");
            if (followUp) {
              followUpOffers.current.add(node.id);
              id = followUp;
              continue;
            }
            return; // aguarda clique no CTA → checkout → confirmação do pagamento
          }

          case "delivery":
          case "link": {
            if (!(await wait(node, token))) return;
            if (c.text) push({ kind: "message", id: lid(), sender: "bot", type: "text", content: { text: c.text }, nodeId: node.id, at: now() });
            push({ kind: node.type, id: lid(), nodeId: node.id, at: now() });
            track("message_viewed", node.id);
            id = nextNodeId(graphRef.current, node.id);
            continue;
          }

          case "tag":
            id = nextNodeId(graphRef.current, node.id); // aplicada no servidor (node_entered)
            continue;

          case "ai": {
            // Cérebro: a partir daqui a IA conversa com o lead
            markChatStarted();
            const ai = c as unknown as AiContent;
            const answer = lastAnswer.current;
            lastAnswer.current = null;
            // voltou para a IA depois dos botões de oferta: ela responde ao que o lead disse
            if (aiTalked.current.has(node.id) && answer) void aiTurnRef.current(node.id, answer, "continue");
            else if (ai.startMode === "ai") void aiTurnRef.current(node.id, null);
            else setAwaiting({ kind: "ai", nodeId: node.id, placeholder: ai.placeholder || undefined });
            return;
          }

          case "end": {
            if (followUpOffers.current.size > 0) {
              // dentro das mensagens de apoio, "Fim" só encerra a sequência; a oferta segue aberta
              if (c.text) {
                if (!(await wait(node, token))) return;
                push({ kind: "message", id: lid(), sender: "bot", type: "text", content: { text: c.text }, nodeId: node.id, at: now() });
                track("message_viewed", node.id);
              }
              return;
            }
            if (c.text) {
              if (!(await wait(node, token))) return;
              push({ kind: "message", id: lid(), sender: "bot", type: "text", content: { text: c.text }, nodeId: node.id, at: now() });
              track("message_viewed", node.id);
            }
            track("chat_completed", node.id);
            setEnded(true);
            return;
          }
        }
      }
      // fim das mensagens de apoio: a oferta continua aberta esperando a compra
      if (runId.current === token && followUpOffers.current.size === 0) setEnded(true);
    },
    [ensureUnlocked, markChatStarted, push, track, wait],
  );

  /** Uma rodada do Cérebro: envia a mensagem do lead e mostra a resposta como se alguém estivesse digitando. */
  const aiTurn = useCallback(
    async (nodeId: string, text: string | null, event?: "call_declined" | "photo" | "continue" | "voice_declined") => {
      const t = transportRef.current;
      if (!t) return;
      aiTalked.current.add(nodeId);
      const token = ++runId.current;
      const node = getNode(graphRef.current, nodeId);
      const placeholder = ((node?.content as AiContent | undefined)?.placeholder as string) || undefined;
      setAwaiting(null);
      await sleep(text === null ? 600 : 900); // "leu" a mensagem
      if (runId.current !== token) return;
      setTyping(true);
      let r;
      try {
        r = await t.ai(nodeId, text, event);
      } catch {
        r = { messages: [tx.netFail], audio: null, offer: null, end: false };
      }
      if (runId.current !== token) return;
      for (let i = 0; i < r.messages.length; i++) {
        if (i > 0) {
          setTyping(true);
          await sleep(Math.min(autoDelay(r.messages[i].length), 3500));
          if (runId.current !== token) return;
        }
        setTyping(false);
        push({ kind: "message", id: lid(), sender: "bot", type: "text", content: { text: r.messages[i] }, nodeId, at: now() });
      }
      if (r.image) {
        setTyping(true);
        await sleep(1000);
        if (runId.current !== token) return;
        setTyping(false);
        push({ kind: "message", id: lid(), sender: "bot", type: r.image.kind === "video" ? "video" : "image", content: { url: r.image.url }, nodeId, at: now() });
      }
      if (r.audio) {
        setTyping(true);
        await sleep(1400);
        if (runId.current !== token) return;
        setTyping(false);
        push({ kind: "message", id: lid(), sender: "bot", type: "audio", content: { url: r.audio.url }, nodeId, at: now() });
      }
      if (r.offer) {
        await sleep(700);
        if (runId.current !== token) return;
        const offer: OfferContent = {
          productId: r.offer.productId,
          headline: r.offer.headline,
          ctaLabel: r.offer.ctaLabel,
          description: r.offer.description,
          downsellProductId: r.offer.downsellProductId,
          downsellText: r.offer.downsellText,
          ...(r.offer.style === "tarot" ? { style: "tarot" as const, tarotCards: r.offer.tarotCards, tarotBackUrl: r.offer.tarotBackUrl } : {}),
          ...(r.offer.style === "live" ? { style: "live" as const, vip: r.offer.vip, ...(r.offer.hasVideo ? { videoId: "brain" } : {}) } : {}),
          ...(r.offer.freeLoop ? { freeLoop: true } : {}),
        };
        if (r.offer.style === "tarot") tarotProducts.current.add(r.offer.productId);
        if (r.offer.style === "live") setVip({ nodeId, phase: "offer", productId: r.offer.productId, offer });
        if (r.offer.style === "call") {
          // oferta do Cérebro em formato de chamada: toca a ligação
          setTyping(false);
          push({ kind: "call", id: lid(), nodeId, at: now() });
          setCall({ nodeId, phase: "ringing", productId: r.offer.productId, offer });
        } else {
          push({ kind: "offer", id: lid(), nodeId, productId: r.offer.productId, offer, at: now() });
        }
      }
      setTyping(false);
      if (r.voiceCall) {
        // ligação de voz (o lead autorizou): toca a tela de ligação; a conversa volta quando a ligação terminar
        await sleep(900);
        if (runId.current !== token) return;
        setVoice({ nodeId, id: r.voiceCall.id, url: r.voiceCall.url, phase: "ringing" });
        return;
      }
      // "Mostrar botões de oferta": a IA explicou e chamou para escolher → segue para os botões ligados nessa saída
      const after = r.end ? nextNodeId(graphRef.current, nodeId, "default") : r.showOffers ? nextNodeId(graphRef.current, nodeId, AI_OFFERS_OUT) : null;
      if (after) void run(after);
      else setAwaiting({ kind: "ai", nodeId, placeholder });
    },
    [push, run],
  );
  aiTurnRef.current = aiTurn;

  // ---------- Ações do visitante ----------
  const chooseButton = useCallback(
    (button: ChoiceButton) => {
      if (!awaiting || awaiting.kind !== "buttons") return;
      const nodeId = awaiting.nodeId;
      setAwaiting(null);
      markChatStarted();
      push({ kind: "message", id: lid(), sender: "user", type: "text", content: { text: button.label }, nodeId, at: now() });
      lastAnswer.current = button.label;
      track("button_clicked", nodeId, { buttonId: button.id });
      void run(nextNodeId(graphRef.current, nodeId, `btn:${button.id}`));
    },
    [awaiting, markChatStarted, push, run, track],
  );

  const submitAnswer = useCallback(
    (value: string) => {
      const text = value.trim();
      if (!text || !awaiting) return;
      const nodeId = awaiting.nodeId;
      if (awaiting.kind === "ai") {
        markChatStarted();
        push({ kind: "message", id: lid(), sender: "user", type: "text", content: { text }, nodeId, at: now() });
        void aiTurn(nodeId, text); // a mensagem é gravada pelo servidor junto com a resposta
        return;
      }
      if (awaiting.kind === "buttons") {
        if (awaiting.inputMode === "click") return;
        // resposta livre: identifica o caminho pelas opções/palavras-chave; sem acerto → "qualquer outra resposta"
        const choice = matchChoice(awaiting.buttons, text);
        lastAnswer.current = text;
        setAwaiting(null);
        markChatStarted();
        push({ kind: "message", id: lid(), sender: "user", type: "text", content: { text }, nodeId, at: now() });
        if (choice) {
          track("button_clicked", nodeId, { buttonId: choice.id, value: text });
          void run(nextNodeId(graphRef.current, nodeId, `btn:${choice.id}`));
        } else {
          track("question_answered", nodeId, { value: text });
          const fallback =
            nextNodeId(graphRef.current, nodeId, "default") ??
            (awaiting.buttons[0] ? nextNodeId(graphRef.current, nodeId, `btn:${awaiting.buttons[0].id}`) : null);
          void run(fallback);
        }
        return;
      }
      setAwaiting(null);
      markChatStarted();
      push({ kind: "message", id: lid(), sender: "user", type: "text", content: { text }, nodeId, at: now() });
      lastAnswer.current = text;
      track("question_answered", nodeId, { value: text });
      void run(nextNodeId(graphRef.current, nodeId));
    },
    [awaiting, markChatStarted, push, run, track, aiTurn],
  );

  /** Foto do lead (câmera ou galeria): aparece no chat na hora, é enviada e segue a conversa. */
  const [photoBusy, setPhotoBusy] = useState(false);
  const sendPhoto = useCallback(
    async (file: File) => {
      const t = transportRef.current;
      const a = awaiting;
      if (!t || !a || photoBusy) return;
      if (a.kind === "buttons" && a.inputMode === "click") return;
      const nodeId = a.nodeId;
      const fail = (text: string) =>
        push({ kind: "message", id: lid(), sender: "system", type: "text", content: { text }, at: now() });
      let blob: Blob;
      try {
        blob = await compressPhoto(file);
      } catch {
        fail(tx.photoOpenFail);
        return;
      }
      const id = lid();
      const localUrl = URL.createObjectURL(blob);
      setPhotoBusy(true);
      markChatStarted();
      push({ kind: "message", id, sender: "user", type: "image", content: { url: localUrl, sending: true }, nodeId, at: now() });
      setAwaiting(null);
      try {
        await t.sendPhoto(nodeId, blob);
      } catch (e) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        fail(e instanceof Error && e.message ? `${tx.photoNotSentReason} ${e.message}` : tx.photoNotSent);
        setAwaiting(a);
        return;
      } finally {
        setPhotoBusy(false);
      }
      setItems((prev) => prev.map((i) => (i.id === id && i.kind === "message" ? { ...i, content: { url: localUrl } } : i)));
      if (a.kind === "ai") {
        void aiTurn(nodeId, null, "photo");
      } else if (a.kind === "buttons") {
        // foto no lugar de escolher uma opção: segue o caminho de "qualquer outra resposta"
        const fallback =
          nextNodeId(graphRef.current, nodeId, "default") ?? (a.buttons[0] ? nextNodeId(graphRef.current, nodeId, `btn:${a.buttons[0].id}`) : null);
        void run(fallback);
      } else {
        void run(nextNodeId(graphRef.current, nodeId));
      }
    },
    [awaiting, photoBusy, push, markChatStarted, aiTurn, run],
  );

  const openCheckout = useCallback(
    (offerNodeId: string, aiProductId?: string) => {
      const node = getNode(graphRef.current, offerNodeId);
      const productId = aiProductId ?? (node?.content as { productId?: string } | undefined)?.productId;
      const product = productId ? funnel.products[productId] : undefined;
      track("offer_clicked", offerNodeId, aiProductId ? { productId: aiProductId } : undefined);
      track("checkout_started", offerNodeId, aiProductId ? { productId: aiProductId } : undefined);
      // quem clicou em comprar não recebe mais as mensagens de apoio
      if (followUpOffers.current.size > 0) {
        followUpOffers.current.clear();
        runId.current++;
        setTyping(false);
        setAwaiting(null);
      }
      if (product && transportRef.current?.mode === "live") {
        pixelInitiateCheckout({ value: product.price / 100, name: product.name, id: product.id, metaPixelId: product.metaPixelId, currency: product.currency, eventId: `ic_${offerNodeId}_${Date.now()}` });
      }
      setCheckoutOpened(true);
      if (product?.externalCheckoutUrl) {
        window.open(product.externalCheckoutUrl, "_blank", "noopener");
        return;
      }
      setItems((prev) => {
        const open = prev.some((i) => i.kind === "checkout" && i.nodeId === offerNodeId && i.productId === aiProductId) &&
          !prev.some((i) => i.kind === "payment");
        return open ? prev : [...prev, { kind: "checkout", id: lid(), nodeId: offerNodeId, productId: aiProductId, at: now() }];
      });
    },
    [funnel.products, track],
  );

  const submitCheckout = useCallback(
    async (offerNodeId: string, form: CheckoutForm, opts?: { silent?: boolean }) => {
      const t = transportRef.current;
      if (!t) throw new Error(tx.netFail);
      const productId = form.productId ?? (getNode(graphRef.current, offerNodeId)?.content as { productId?: string } | undefined)?.productId;
      if (!form.payer && payerRef.current && productId && funnelProducts.current[productId]?.payerForm) form = { ...form, payer: payerRef.current };
      const payment = await t.checkout(offerNodeId, form);
      if (form.payer) {
        payerRef.current = form.payer;
        setPayer(form.payer);
      }
      setPayments((p) => ({ ...p, [payment.id]: payment }));
      // chamada de vídeo: o PIX aparece só no pop-up/na chamada, não como card no chat
      if (opts?.silent) return payment;
      setItems((prev) => {
        const withoutForm = prev.filter((i) => !(i.kind === "checkout" && i.nodeId === offerNodeId && i.productId === form.productId));
        if (withoutForm.some((i) => i.kind === "payment" && i.paymentId === payment.id)) return withoutForm;
        return [...withoutForm, { kind: "payment", id: lid(), paymentId: payment.id, at: now() }];
      });
      if (payment.redirectUrl) window.open(payment.redirectUrl, "_blank", "noopener");
      return payment;
    },
    [],
  );

  const applyPayments = useCallback((list: PublicPaymentInfo[]) => {
    if (!list.length) return;
    setPayments((prev) => {
      const next = { ...prev };
      for (const p of list) next[p.id] = p;
      return next;
    });
  }, []);

  const simulatePayment = useCallback(
    async (paymentId: string, status: "APPROVED" | "FAILED") => {
      const p = await transportRef.current?.simulatePayment?.(paymentId, status);
      if (p) applyPayments([p]);
    },
    [applyPayments],
  );

  const addServerMessages = useCallback((msgs: ServerMessage[]) => {
    const fresh = msgs.filter((m) => !seenServerMsgs.current.has(m.id));
    if (!fresh.length) return;
    fresh.forEach((m) => seenServerMsgs.current.add(m.id));
    setItems((prev) => [
      ...prev,
      ...fresh.map((m): ChatItem =>
        m.type === "recovery"
          ? {
              kind: "recovery",
              id: m.id,
              text: String(m.content.text ?? ""),
              buttonLabel: String(m.content.buttonLabel ?? "CONTINUAR"),
              offerNodeId: (m.content.offerNodeId as string) ?? m.nodeId,
              at: m.createdAt,
            }
          : { kind: "message", id: m.id, sender: "system", type: "text", content: m.content, at: m.createdAt },
      ),
    ]);
  }, []);

  /**
   * Pagamento aprovado de uma chamada de vídeo (principal ou downsell) → botão "Entrar na chamada" no chat.
   * Cobre quem recarregou a página, saiu e voltou, ou fechou o pop-up e pagou pelo card.
   */
  const grantedCalls = useRef(new Set<string>());
  const grantCallAccess = useCallback(
    async (nodeId: string, productId: string): Promise<boolean> => {
      const node = getNode(graphRef.current, nodeId);
      let isCall = false;
      if (node?.type === "offer") {
        const oc = node.content as OfferContent;
        isCall = (oc.style === "call" || (oc.style === "live" && !!oc.videoId)) && (productId === oc.productId || productId === oc.downsellProductId);
      } else if (node?.type === "ai") {
        isCall = callProducts.current.has(productId);
        if (!isCall && !upsellProducts.current.has(productId)) {
          // oferta do Cérebro: o servidor diz se o produto é de uma chamada
          isCall = !!(await transportRef.current?.callVideo(nodeId, productId).catch(() => null));
          if (isCall) callProducts.current.add(productId);
        }
      }
      const key = `${nodeId}:${productId}`;
      if (isCall && !grantedCalls.current.has(key)) {
        grantedCalls.current.add(key);
        push({ kind: "callAccess", id: lid(), nodeId, productId, at: now() });
      }
      return isCall;
    },
    [push],
  );

  // ---------- Avanço do fluxo após eventos de pagamento ----------
  useEffect(() => {
    for (const p of Object.values(payments)) {
      if (!p.offerNodeId || advancedPayments.current.has(p.id)) continue;
      if (p.status === "APPROVED" || p.status === "FAILED") {
        advancedPayments.current.add(p.id);
        // venda confirmada pelo gateway (mesmo id do evento enviado pela API de Conversões)
        if (p.status === "APPROVED" && transportRef.current?.mode === "live") {
          const product = funnel.products[p.productId];
          pixelPurchase({ value: p.amount / 100, name: product?.name ?? "Produto", id: p.productId, eventId: p.id, metaPixelId: product?.metaPixelId, currency: product?.currency });
        }
        // upsell comprado durante a chamada de vídeo: não segue o ramo da oferta principal
        const offerNode = getNode(graphRef.current, p.offerNodeId);
        if (upsellProducts.current.has(p.productId)) continue;
        if (offerNode?.type === "offer") {
          const oc = offerNode.content as OfferContent;
          if (p.productId !== oc.productId && p.productId !== oc.downsellProductId) continue;
        }
        const target = nextNodeId(graphRef.current, p.offerNodeId, p.status === "APPROVED" ? "payment:approved" : "payment:failed");
        if (target) {
          // interrompe as mensagens de apoio que ainda estiverem rodando
          followUpOffers.current.clear();
          runId.current++;
          setTyping(false);
          setAwaiting(null);
        }
        // busca a confirmação registrada pelo servidor antes de seguir o ramo do pagamento
        const t = transportRef.current;
        void (t ? t.poll(lastPoll.current).catch(() => null) : Promise.resolve(null)).then((r) => {
          if (r) {
            lastPoll.current = r.serverTime;
            addServerMessages(r.messages);
          }
          void (async () => {
            const isCall = p.status === "APPROVED" ? await grantCallAccess(p.offerNodeId!, p.productId) : false;
            if (target) void run(target);
            else if (p.status === "APPROVED" && !isCall && !tarotProducts.current.has(p.productId) && getNode(graphRef.current, p.offerNodeId)?.type === "ai") {
              // oferta da IA sem ramo "Comprou": botão de acesso do produto e a conversa com a IA continua
              push({ kind: "delivery", id: lid(), nodeId: p.offerNodeId!, productId: p.productId, at: now() });
            }
          })();
        });
      }
    }
  }, [payments, run, addServerMessages, funnel.products, push, grantCallAccess]);

  // ---------- Polling: status do pagamento + mensagens do servidor (recuperação) ----------
  const hasPending = Object.values(payments).some((p) => p.status === "PENDING" || p.status === "CREATED");
  const hasApproved = Object.values(payments).some((p) => p.status === "APPROVED");
  useEffect(() => {
    if (!transport || (!hasPending && !(checkoutOpened && !hasApproved))) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await transport.poll(lastPoll.current);
        if (stop) return;
        lastPoll.current = r.serverTime;
        applyPayments(r.payments);
        addServerMessages(r.messages);
      } catch {
        /* rede instável: tenta no próximo ciclo */
      }
    };
    const interval = setInterval(tick, hasPending ? 4000 : 20000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      stop = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [transport, hasPending, hasApproved, checkoutOpened, applyPayments, addServerMessages]);

  // ---------- Início / retomada ----------
  useEffect(() => {
    if (started.current || !transport || hold) return;
    started.current = true;

    if (!resume || !resume.resumed) {
      void run(findStartNode(graphRef.current)?.id ?? null);
      return;
    }

    chatStartedSent.current = true;
    lastPoll.current = new Date().toISOString();
    const restored: ChatItem[] = [];
    const paymentMap: Record<string, PublicPaymentInfo> = {};
    for (const p of resume.payments) paymentMap[p.id] = p;
    for (const m of resume.messages) {
      seenServerMsgs.current.add(m.id);
      if (m.nodeId && getNode(graphRef.current, m.nodeId)?.type === "ai") aiTalked.current.add(m.nodeId);
      const c = m.content ?? {};
      if (m.type === "offer" && m.nodeId) {
        const isAi = getNode(graphRef.current, m.nodeId)?.type === "ai";
        if (isAi && c.style === "tarot" && typeof c.productId === "string") tarotProducts.current.add(c.productId);
        restored.push(
          isAi && typeof c.productId === "string"
            ? {
                kind: "offer",
                id: m.id,
                nodeId: m.nodeId,
                productId: c.productId,
                offer: {
                  productId: c.productId,
                  headline: (c.headline as string) || undefined,
                  ctaLabel: (c.ctaLabel as string) || undefined,
                  ...(c.style === "tarot" && Array.isArray(c.tarotCards)
                    ? { style: "tarot" as const, tarotCards: c.tarotCards as TarotCard[], tarotBackUrl: (c.tarotBackUrl as string) || undefined }
                    : {}),
                  ...(c.style === "live"
                    ? {
                        style: "live" as const,
                        vip: (c.vip as OfferContent["vip"]) ?? undefined,
                        downsellProductId: (c.downsellProductId as string) || undefined,
                        ...(c.hasVideo ? { videoId: "brain" } : {}),
                      }
                    : {}),
                },
                at: m.createdAt,
              }
            : { kind: "offer", id: m.id, nodeId: m.nodeId, at: m.createdAt },
        );
      }
      else if (m.type === "checkout" && typeof c.paymentId === "string" && paymentMap[c.paymentId])
        restored.push({ kind: "payment", id: m.id, paymentId: c.paymentId, at: m.createdAt });
      else if (m.type === "recovery")
        restored.push({ kind: "recovery", id: m.id, text: String(c.text ?? ""), buttonLabel: String(c.buttonLabel ?? "CONTINUAR"), offerNodeId: (c.offerNodeId as string) ?? m.nodeId, at: m.createdAt });
      else if (m.type === "buttons") {
        if (c.text) restored.push({ kind: "message", id: m.id, sender: "bot", type: "text", content: { text: c.text }, nodeId: m.nodeId, at: m.createdAt });
      } else if (m.type === "image" || m.type === "video" || m.type === "audio" || m.type === "text")
        restored.push({ kind: "message", id: m.id, sender: m.sender, type: m.type, content: c, nodeId: m.nodeId, at: m.createdAt });
      else if ((m.type === "delivery" || m.type === "link") && m.nodeId) {
        if (c.text) restored.push({ kind: "message", id: `${m.id}_t`, sender: "bot", type: "text", content: { text: c.text }, nodeId: m.nodeId, at: m.createdAt });
        restored.push({ kind: m.type, id: m.id, nodeId: m.nodeId, at: m.createdAt });
      } else if (m.type === "payment_update")
        restored.push({ kind: "message", id: m.id, sender: "system", type: "text", content: c, at: m.createdAt });
    }
    const savedCurrent = getNode(graphRef.current, resume.conversation.currentNodeId);
    const shownOffers = new Set(restored.flatMap((i) => (i.kind === "offer" ? [i.nodeId] : [])));
    const seenNodes = new Set(resume.messages.map((m) => m.nodeId).filter(Boolean));
    // ramo de pagamento ainda não exibido: a oferta parada (ou com mensagens de apoio) ainda pode avançar
    const branchPending = (offerNodeId: string) =>
      ![...unlockedByOffers(graphRef.current, [offerNodeId])].some((nid) => seenNodes.has(nid));
    for (const p of resume.payments) {
      const atOffer = (savedCurrent?.type === "offer" || savedCurrent?.type === "ai") && p.offerNodeId === savedCurrent.id;
      const followUp = !!p.offerNodeId && shownOffers.has(p.offerNodeId) && p.status === "APPROVED" && branchPending(p.offerNodeId);
      if (!atOffer && !followUp) advancedPayments.current.add(p.id);
    }
    // ofertas ainda abertas com mensagens de apoio: o fim da sequência não encerra a conversa
    for (const offerId of shownOffers) {
      const paid = resume.payments.some((p) => p.offerNodeId === offerId && p.status === "APPROVED");
      if (!paid && nextNodeId(graphRef.current, offerId, "default")) followUpOffers.current.add(offerId);
    }
    setItems(restored);
    setPayments(paymentMap);
    if (resume.payments.length) setCheckoutOpened(true);
    // chamadas já pagas: o botão para entrar na chamada volta para o chat
    for (const p of resume.payments) {
      if (p.status === "APPROVED" && p.offerNodeId && advancedPayments.current.has(p.id)) void grantCallAccess(p.offerNodeId, p.productId);
    }

    if (resume.conversation.status === "completed") {
      if (resume.payments.some((p) => p.status === "APPROVED")) void ensureUnlocked();
      setEnded(true);
      return;
    }

    void (async () => {
      // quem já pagou recebe de volta o conteúdo liberado (entregas, links e próximos passos)
      if (resume.payments.some((p) => p.status === "APPROVED") || savedCurrent?.locked) await ensureUnlocked();
      const current = getNode(graphRef.current, resume.conversation.currentNodeId);
      if (!current || current.locked) {
        if (!current) void run(findStartNode(graphRef.current)?.id ?? null);
        return;
      }
      const c = current.content as unknown as Record<string, unknown>;
      if (current.type === "buttons" || (current.type === "question" && c.mode !== "open")) {
        setAwaiting(buttonsAwaiting(current.id, c));
      } else if (current.type === "question") {
        setAwaiting({ kind: "open", nodeId: current.id, placeholder: (c.placeholder as string) || undefined });
      } else if (current.type === "ai") {
        setAwaiting({ kind: "ai", nodeId: current.id, placeholder: (c.placeholder as string) || undefined });
      } else if (current.type === "offer") {
        // pagamentos já decididos e ainda não avançados são tratados pelo efeito de pagamentos
        if (!restored.some((i) => i.kind === "offer" && i.nodeId === current.id)) {
          setItems((prev) => [...prev, { kind: "offer", id: lid(), nodeId: current.id, at: now() }]);
        }
      } else {
        void run(nextNodeId(graphRef.current, current.id));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, hold]);

  // ---------- Chamada de vídeo ----------
  const [callError, setCallError] = useState<string | null>(null);
  const callOffer = (c: NonNullable<typeof call>) => c.offer ?? (getNode(graphRef.current, c.nodeId)?.content as OfferContent | undefined);

  /** gera o PIX do produto (principal ou downsell) e mostra o pop-up só com o código */
  const startCallPix = useCallback(
    async (c: NonNullable<typeof call>, productId: string, downsell: boolean, freeLoop = false) => {
      const nodeId = c.nodeId;
      // chamada de vídeo 02: abre a chamada (FREE em loop) e o PIX fica por cima do vídeo
      const phase = freeLoop ? ("active" as const) : ("pix" as const);
      setCall({ ...c, phase, payProductId: productId, downsell, ...(freeLoop ? { free: true } : {}) });
      callProducts.current.add(productId);
      setCallError(null);
      const product = funnel.products[productId];
      track("offer_clicked", nodeId, { call: downsell ? "declined" : "answered", productId });
      track("checkout_started", nodeId, { productId, ...(downsell ? { downsell: true } : {}) });
      if (product && transportRef.current?.mode === "live") {
        pixelInitiateCheckout({ value: product.price / 100, name: product.name, id: product.id, metaPixelId: product.metaPixelId, currency: product.currency, eventId: `ic_${nodeId}_${Date.now()}` });
      }
      setCheckoutOpened(true);
      // dados do comprador ainda não informados: o pop-up mostra o formulário antes de gerar
      if (product?.payerForm && !payerRef.current && transportRef.current?.mode === "live") {
        setCall({ ...c, phase, payProductId: productId, downsell, needPayer: true, ...(freeLoop ? { free: true } : {}) });
        return;
      }
      const mainOfNode = (getNode(graphRef.current, nodeId)?.content as OfferContent | undefined)?.productId;
      try {
        await submitCheckout(nodeId, { method: "PIX", ...(productId !== mainOfNode ? { productId } : {}) }, { silent: true });
      } catch (e) {
        // o gateway pediu os dados do comprador: o pop-up mostra o formulário
        if (e instanceof ApiError && (e.data.code === "payer_required" || e.data.code === "invalid_fields")) {
          setCall((cur) => (cur && cur.nodeId === nodeId ? { ...cur, needPayer: true } : cur));
          return;
        }
        setCallError(e instanceof Error ? e.message : tx.generateError);
      }
    },
    [funnel.products, submitCheckout, track],
  );

  const answerCall = useCallback(() => {
    if (!call) return;
    const productId = call.productId ?? callOffer(call)?.productId ?? "";
    if (callOffer(call)?.freeLoop) {
      // chamada de vídeo 02: a chamada abre com o FREE; a oferta aparece no fim dele (como upsell)
      setCall({ ...call, phase: "active", free: true, payProductId: productId });
      track("offer_clicked", call.nodeId, { call: "answered", productId, free: true });
      return;
    }
    void startCallPix(call, productId, false);
  }, [call, startCallPix]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Ligação de voz ----------
  const answerVoice = useCallback(() => {
    setVoice((v) => (v ? { ...v, phase: "active" } : v));
  }, []);
  const declineVoice = useCallback(() => {
    const v = voice;
    if (!v) return;
    setVoice(null);
    void aiTurnRef.current(v.nodeId, null, "voice_declined");
  }, [voice]);
  /** a ligação terminou (áudio acabou ou o lead desligou): tela "chamada encerrada", depois a mensagem e a oferta no chat */
  const endVoice = useCallback(
    async (seconds: number) => {
      const v = voice;
      const t = transportRef.current;
      if (!v || v.phase === "ended") return;
      setVoice({ ...v, phase: "ended", seconds });
      const token = ++runId.current;
      const resP = t ? t.voiceCallEnded(v.nodeId, v.id, seconds).catch(() => null) : Promise.resolve(null);
      await sleep(1800);
      setVoice(null);
      const placeholder = ((getNode(graphRef.current, v.nodeId)?.content as AiContent | undefined)?.placeholder as string) || undefined;
      const r = await resP;
      if (runId.current !== token) return;
      if (r?.endText) {
        setTyping(true);
        await sleep(Math.min(autoDelay(r.endText.length), 3000));
        if (runId.current !== token) return;
        setTyping(false);
        push({ kind: "message", id: lid(), sender: "bot", type: "text", content: { text: r.endText }, nodeId: v.nodeId, at: now() });
      }
      if (r?.offer) {
        await sleep(700);
        if (runId.current !== token) return;
        push({
          kind: "offer",
          id: lid(),
          nodeId: v.nodeId,
          productId: r.offer.productId,
          offer: { productId: r.offer.productId, headline: r.offer.headline, ctaLabel: r.offer.ctaLabel },
          at: now(),
        });
      }
      setAwaiting({ kind: "ai", nodeId: v.nodeId, placeholder });
    },
    [voice, push],
  );

  const declineCall = useCallback(() => {
    if (!call) return;
    const nodeId = call.nodeId;
    const downsell = callOffer(call)?.downsellProductId;
    if (downsell && funnel.products[downsell]) {
      // recusou: o mesmo pop-up com o downsell (chamada mais curta e mais barata)
      void startCallPix(call, downsell, true);
      return;
    }
    setCall(null);
    track("offer_clicked", nodeId, { call: "declined" });
    if (call.productId) {
      // oferta do Cérebro sem downsell: a IA fica sabendo da recusa e continua
      void aiTurnRef.current(nodeId, null, "call_declined");
      return;
    }
    const decline = graphRef.current.edges.find((e) => e.source === nodeId && e.condition === "btn:decline");
    if (decline) void run(decline.target);
    else push({ kind: "offer", id: lid(), nodeId, at: now() }); // sem caminho de recusa: card normal no chat
  }, [call, funnel.products, push, run, startCallPix, track]); // eslint-disable-line react-hooks/exhaustive-deps

  // pagamento do pop-up aprovado → libera o vídeo
  useEffect(() => {
    if (!call?.payProductId || !(call.phase === "pix" || (call.phase === "active" && call.free))) return;
    const ok = Object.values(payments).some((p) => p.offerNodeId === call.nodeId && p.productId === call.payProductId && p.status === "APPROVED");
    if (ok) setCall({ ...call, phase: "active", free: false });
  }, [call, payments]);

  const hangUp = useCallback(() => {
    if (!call) return;
    const nodeId = call.nodeId;
    const paidProduct = call.payProductId;
    const paid = !!paidProduct && Object.values(payments).some((p) => p.offerNodeId === nodeId && p.productId === paidProduct && p.status === "APPROVED");
    setCall(null);
    // fechou sem pagar: deixa o card no chat para comprar depois
    if (!paid) push({ kind: "offer", id: lid(), nodeId, ...(call.productId ? { productId: call.productId, offer: call.offer } : {}), at: now() });
  }, [call, payments, push]);

  /** formulário do pop-up da chamada: gera o pagamento com os dados do comprador */
  const submitCallPayer = useCallback(
    async (data: PayerData) => {
      const c = call;
      if (!c?.payProductId) return;
      const mainOfNode = (getNode(graphRef.current, c.nodeId)?.content as OfferContent | undefined)?.productId;
      await submitCheckout(c.nodeId, { method: "PIX", payer: data, ...(c.payProductId !== mainOfNode ? { productId: c.payProductId } : {}) }, { silent: true });
      setCall((cur) => (cur && cur.nodeId === c.nodeId ? { ...cur, needPayer: false } : cur));
    },
    [call, submitCheckout],
  );

  /**
   * chamada de vídeo 02: o lead tocou em pagar (oferta do fim do FREE ou "Oferta" marcada no FREE do vídeo)
   * → gera o PIX sem sair da chamada; pago, libera o VIP
   */
  const buyFreeCall = useCallback(
    (productId?: string) => {
      const pid = productId ?? call?.payProductId;
      if (!call?.free || !pid) return;
      void startCallPix(call, pid, false, true);
    },
    [call, startCallPix],
  );

  /** entra (ou volta) na chamada já paga */
  const enterCall = useCallback((nodeId: string, productId: string) => {
    const node = getNode(graphRef.current, nodeId);
    setCall({ nodeId, phase: "active", payProductId: productId, ...(node?.type === "ai" ? { productId } : {}) });
  }, []);

  /** upsell marcado no vídeo da chamada */
  const buyUpsell = useCallback(
    async (productId: string) => {
      if (!call) return;
      setCallError(null);
      upsellProducts.current.add(productId);
      track("checkout_started", call.nodeId, { productId, upsell: true });
      try {
        await submitCheckout(call.nodeId, { method: "PIX", productId }, { silent: true });
      } catch (e) {
        setCallError(e instanceof Error ? e.message : tx.generateError);
      }
    },
    [call, submitCheckout, track],
  );

  // ---------- Canal VIP AO VIVO ----------
  const vipOffer = (v: NonNullable<typeof vip>) => v.offer ?? (getNode(graphRef.current, v.nodeId)?.content as OfferContent | undefined);

  /** reabre pelo card do chat: com pagamento pendente volta direto para o pagamento */
  const openVip = useCallback(
    (nodeId: string, productId?: string, offer?: OfferContent) => {
      const pending = Object.values(payments).find((p) => p.offerNodeId === nodeId && (p.status === "PENDING" || p.status === "CREATED"));
      track("offer_clicked", nodeId, productId ? { productId } : undefined);
      setVip({ nodeId, productId, offer, phase: pending ? "pay" : "offer", payProductId: pending?.productId });
    },
    [payments, track],
  );

  /** mensagens de conversão no chat (acima do pagamento) enquanto ele não paga */
  const pushVipMessages = useCallback(
    async (nodeId: string, o: OfferContent | undefined) => {
      if (vipPushed.current.has(nodeId)) return;
      vipPushed.current.add(nodeId);
      const texts = o?.vip?.payMessages ?? [];
      const paid = () => Object.values(paymentsRef.current).some((p) => p.offerNodeId === nodeId && p.status === "APPROVED");
      for (const text of texts) {
        await sleep(1400);
        if (paid()) return;
        setTyping(true);
        await sleep(Math.min(autoDelay(text.length), 2600));
        setTyping(false);
        if (paid()) return;
        push({ kind: "message", id: lid(), sender: "bot", type: "text", content: { text }, nodeId, at: now() });
      }
      if (o?.vip?.lockedImageUrl && !paid()) {
        await sleep(1200);
        push({ kind: "message", id: lid(), sender: "bot", type: "image", content: { url: o.vip.lockedImageUrl, locked: true }, nodeId, at: now() });
      }
    },
    [push],
  );

  /** escolheu um ingresso: gera o pagamento e mostra a folha com o código */
  const pickVip = useCallback(
    async (productId: string) => {
      const v = vip;
      if (!v) return;
      const nodeId = v.nodeId;
      const o = vipOffer(v);
      setVipError(null);
      setVip({ ...v, phase: "pay", payProductId: productId, needPayer: false });
      const product = funnel.products[productId];
      track("checkout_started", nodeId, { productId, vip: productId === o?.productId ? "complete" : "basic" });
      if (product && transportRef.current?.mode === "live") {
        pixelInitiateCheckout({ value: product.price / 100, name: product.name, id: product.id, metaPixelId: product.metaPixelId, currency: product.currency, eventId: `ic_${nodeId}_${Date.now()}` });
      }
      setCheckoutOpened(true);
      // quem clicou em comprar não recebe mais as mensagens de apoio do bloco
      if (followUpOffers.current.size > 0) {
        followUpOffers.current.clear();
        runId.current++;
        setTyping(false);
      }
      void pushVipMessages(nodeId, o);
      if (o?.videoId) callProducts.current.add(productId);
      if (product?.payerForm && !payerRef.current && transportRef.current?.mode === "live") {
        setVip({ ...v, phase: "pay", payProductId: productId, needPayer: true });
        return;
      }
      const mainOfNode = (getNode(graphRef.current, nodeId)?.content as OfferContent | undefined)?.productId;
      try {
        await submitCheckout(nodeId, { method: "PIX", ...(productId !== mainOfNode ? { productId } : {}) }, { silent: true });
      } catch (e) {
        if (e instanceof ApiError && (e.data.code === "payer_required" || e.data.code === "invalid_fields")) {
          setVip((cur) => (cur && cur.nodeId === nodeId ? { ...cur, needPayer: true } : cur));
          return;
        }
        setVipError(e instanceof Error ? e.message : tx.generateError);
      }
    },
    [vip, funnel.products, pushVipMessages, submitCheckout, track], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const submitVipPayer = useCallback(
    async (data: PayerData) => {
      const v = vip;
      if (!v?.payProductId) return;
      const mainOfNode = (getNode(graphRef.current, v.nodeId)?.content as OfferContent | undefined)?.productId;
      await submitCheckout(v.nodeId, { method: "PIX", payer: data, ...(v.payProductId !== mainOfNode ? { productId: v.payProductId } : {}) }, { silent: true });
      setVip((cur) => (cur && cur.nodeId === v.nodeId ? { ...cur, needPayer: false } : cur));
    },
    [vip, submitCheckout],
  );

  /** fechar: no upgrade fecha; no pagamento pergunta "vai desistir agora?" */
  const closeVip = useCallback(() => {
    setVip((cur) => (!cur ? cur : cur.phase === "pay" ? { ...cur, phase: "exit" } : null));
  }, []);
  const stayVip = useCallback(() => setVip((cur) => (cur ? { ...cur, phase: cur.payProductId ? "pay" : "offer" } : cur)), []);
  const leaveVip = useCallback(() => {
    if (vip) track("vip_exit", vip.nodeId);
    setVip(null);
  }, [vip, track]);

  // pagamento aprovado: fecha a folha (o fluxo segue pelo ramo "Comprou")
  useEffect(() => {
    if (!vip?.payProductId) return;
    const ok = Object.values(payments).some((p) => p.offerNodeId === vip.nodeId && p.productId === vip.payProductId && p.status === "APPROVED");
    if (!ok) return;
    const o = vipOffer(vip);
    setVip(null);
    // vídeo escolhido na oferta: a chamada abre direto (o botão "Entrar na chamada" também fica no chat)
    if (o?.videoId) setCall({ nodeId: vip.nodeId, phase: "active", payProductId: vip.payProductId, ...(vip.productId ? { productId: vip.payProductId } : {}) });
  }, [vip, payments]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Canal VIP AO VIVO: libera a próxima prévia (o servidor manda uma por vez, na ordem) */
  const [previewBusy, setPreviewBusy] = useState(false);
  const revealPreview = useCallback(async () => {
    const t = transportRef.current;
    if (!t || previewBusy) return;
    setPreviewBusy(true);
    try {
      setTyping(true);
      const [m] = await Promise.all([t.livePreview().catch(() => null), sleep(900)]);
      setTyping(false);
      if (!m) return;
      seenServerMsgs.current.add(m.id);
      push({ kind: "message", id: m.id, sender: "bot", type: m.type as "image" | "video" | "audio", content: m.content, nodeId: m.nodeId, at: m.createdAt });
    } finally {
      setTyping(false);
      setPreviewBusy(false);
    }
  }, [previewBusy, push]);

  return {
    vip,
    vipError,
    vipOffer: vip ? vipOffer(vip) : undefined,
    openVip,
    pickVip,
    submitVipPayer,
    closeVip,
    stayVip,
    leaveVip,
    revealPreview,
    previewBusy,
    voice,
    answerVoice,
    declineVoice,
    endVoice,
    call,
    callError,
    answerCall,
    buyFreeCall,
    submitCallPayer,
    payer,
    declineCall,
    enterCall,
    hangUp,
    buyUpsell,
    graph,
    items,
    typing,
    awaiting,
    payments,
    ended,
    chooseButton,
    submitAnswer,
    sendPhoto,
    photoBusy,
    openCheckout,
    submitCheckout,
    simulatePayment,
    track,
  };
}
