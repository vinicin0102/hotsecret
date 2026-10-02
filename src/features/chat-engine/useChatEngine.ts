// Executa o fluxo no navegador: percorre os nós em sequência, mostra "digitando", aguarda
// respostas/cliques, abre o checkout e avança somente quando o servidor confirma o pagamento.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnswerInputMode, ChoiceButton, FlowGraph, FlowNode, PublicFunnel } from "@/types/flow";
import { getNode, findStartNode, matchChoice, nextNodeId, resolveDelay } from "./engine";
import type { ChatTransport, CheckoutForm, PublicPaymentInfo, ServerMessage } from "./transport";

export type ChatItem =
  | { kind: "message"; id: string; sender: "bot" | "user" | "system"; type: "text" | "image" | "video" | "audio"; content: Record<string, unknown>; nodeId?: string | null; at: string }
  | { kind: "offer"; id: string; nodeId: string; at: string }
  | { kind: "checkout"; id: string; nodeId: string; at: string }
  | { kind: "payment"; id: string; paymentId: string; at: string }
  | { kind: "delivery"; id: string; nodeId: string; at: string }
  | { kind: "link"; id: string; nodeId: string; at: string }
  | { kind: "recovery"; id: string; text: string; buttonLabel: string; offerNodeId: string | null; at: string };

export type Awaiting =
  | null
  | { kind: "buttons"; nodeId: string; buttons: ChoiceButton[]; inputMode: AnswerInputMode; placeholder?: string }
  | { kind: "open"; nodeId: string; placeholder?: string };

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

export function useChatEngine(funnel: PublicFunnel, transport: ChatTransport | null, resume: ResumeState | null) {
  // o grafo público chega sem o conteúdo pago; ele é mesclado após o pagamento aprovado
  const [graph, setGraph] = useState<FlowGraph>(funnel.graph);
  const graphRef = useRef<FlowGraph>(funnel.graph);
  const unlocking = useRef<Promise<void> | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [typing, setTyping] = useState(false);
  const [awaiting, setAwaiting] = useState<Awaiting>(null);
  const [payments, setPayments] = useState<Record<string, PublicPaymentInfo>>({});
  const [ended, setEnded] = useState(false);
  const [checkoutOpened, setCheckoutOpened] = useState(false);

  const runId = useRef(0);
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
            push({ kind: "offer", id: lid(), nodeId: node.id, at: now() });
            track("offer_viewed", node.id);
            markChatStarted();
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

          case "end": {
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
      if (runId.current === token) setEnded(true);
    },
    [ensureUnlocked, markChatStarted, push, track, wait],
  );

  // ---------- Ações do visitante ----------
  const chooseButton = useCallback(
    (button: ChoiceButton) => {
      if (!awaiting || awaiting.kind !== "buttons") return;
      const nodeId = awaiting.nodeId;
      setAwaiting(null);
      markChatStarted();
      push({ kind: "message", id: lid(), sender: "user", type: "text", content: { text: button.label }, nodeId, at: now() });
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
      if (awaiting.kind === "buttons") {
        if (awaiting.inputMode === "click") return;
        // resposta livre: identifica o caminho pelas opções/palavras-chave; sem acerto → "qualquer outra resposta"
        const choice = matchChoice(awaiting.buttons, text);
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
      track("question_answered", nodeId, { value: text });
      void run(nextNodeId(graphRef.current, nodeId));
    },
    [awaiting, markChatStarted, push, run, track],
  );

  const openCheckout = useCallback(
    (offerNodeId: string) => {
      const node = getNode(graphRef.current, offerNodeId);
      const productId = (node?.content as { productId?: string } | undefined)?.productId;
      const product = productId ? funnel.products[productId] : undefined;
      track("offer_clicked", offerNodeId);
      track("checkout_started", offerNodeId);
      setCheckoutOpened(true);
      if (product?.externalCheckoutUrl) {
        window.open(product.externalCheckoutUrl, "_blank", "noopener");
        return;
      }
      setItems((prev) => {
        const open = prev.some((i) => i.kind === "checkout" && i.nodeId === offerNodeId) &&
          !prev.some((i) => i.kind === "payment");
        return open ? prev : [...prev, { kind: "checkout", id: lid(), nodeId: offerNodeId, at: now() }];
      });
    },
    [funnel.products, track],
  );

  const submitCheckout = useCallback(
    async (offerNodeId: string, form: CheckoutForm) => {
      const t = transportRef.current;
      if (!t) throw new Error("Sem conexão");
      const payment = await t.checkout(offerNodeId, form);
      setPayments((p) => ({ ...p, [payment.id]: payment }));
      setItems((prev) => {
        const withoutForm = prev.filter((i) => !(i.kind === "checkout" && i.nodeId === offerNodeId));
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

  // ---------- Avanço do fluxo após eventos de pagamento ----------
  useEffect(() => {
    for (const p of Object.values(payments)) {
      if (!p.offerNodeId || advancedPayments.current.has(p.id)) continue;
      if (p.status === "APPROVED" || p.status === "FAILED") {
        advancedPayments.current.add(p.id);
        const target = nextNodeId(graphRef.current, p.offerNodeId, p.status === "APPROVED" ? "payment:approved" : "payment:failed");
        // busca a confirmação registrada pelo servidor antes de seguir o ramo do pagamento
        const t = transportRef.current;
        void (t ? t.poll(lastPoll.current).catch(() => null) : Promise.resolve(null)).then((r) => {
          if (r) {
            lastPoll.current = r.serverTime;
            addServerMessages(r.messages);
          }
          if (target) void run(target);
        });
      }
    }
  }, [payments, run, addServerMessages]);

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
    if (started.current || !transport) return;
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
      const c = m.content ?? {};
      if (m.type === "offer" && m.nodeId) restored.push({ kind: "offer", id: m.id, nodeId: m.nodeId, at: m.createdAt });
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
    // só pagamentos da oferta em que o visitante parou ainda podem avançar o fluxo
    for (const p of resume.payments) {
      if (!(savedCurrent?.type === "offer" && p.offerNodeId === savedCurrent.id)) advancedPayments.current.add(p.id);
    }
    setItems(restored);
    setPayments(paymentMap);
    if (resume.payments.length) setCheckoutOpened(true);

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
  }, [transport]);

  return {
    graph,
    items,
    typing,
    awaiting,
    payments,
    ended,
    chooseButton,
    submitAnswer,
    openCheckout,
    submitCheckout,
    simulatePayment,
    track,
  };
}
