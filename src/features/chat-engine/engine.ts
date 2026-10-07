// Flow Engine puro (sem React, sem rede) — usado pelo chat público, pelo preview e pelos testes.
import type { ChoiceButton, DelaySettings, FlowEdge, FlowGraph, FlowNode, FunnelDelay } from "@/types/flow";
import { DEFAULT_FUNNEL_DELAY } from "@/types/flow";

export const WAITING_TYPES = new Set(["question", "buttons", "offer"]);

export function findStartNode(graph: FlowGraph): FlowNode | undefined {
  return graph.nodes.find((n) => n.type === "start");
}

export function getNode(graph: FlowGraph, id: string | null | undefined): FlowNode | undefined {
  if (!id) return undefined;
  return graph.nodes.find((n) => n.id === id);
}

export function outgoingEdges(graph: FlowGraph, nodeId: string): FlowEdge[] {
  return graph.edges.filter((e) => e.source === nodeId);
}

/**
 * Identifica o próximo nó a partir de um nó e de uma condição
 * ("default", "btn:<id>", "payment:approved", "payment:failed", "ai:offers").
 * Quando não existe conexão para a condição específica, usa a conexão "default".
 */
export function nextNodeId(graph: FlowGraph, nodeId: string, condition = "default"): string | null {
  const edges = outgoingEdges(graph, nodeId);
  const exact = edges.find((e) => e.condition === condition);
  if (exact) return exact.target;
  // eventos de pagamento e saídas especiais da IA nunca caem no default
  if (condition.startsWith("payment:") || condition.startsWith("ai:")) return null;
  const fallback = edges.find((e) => e.condition === "default" || !e.condition);
  return fallback ? fallback.target : null;
}

/** Bloco Cérebro: saída "Mostrar botões de oferta" */
export const AI_OFFERS_OUT = "ai:offers";

/**
 * Ofertas do fluxo ligadas na saída "Mostrar botões de oferta" de um bloco Cérebro
 * (ex.: Botões → cada botão leva a uma Oferta). A IA usa para explicar os produtos antes de soltar os botões.
 */
export function flowOffersFrom(graph: FlowGraph, aiNodeId: string): { productId: string; headline?: string; button?: string }[] {
  const start = graph.edges.find((e) => e.source === aiNodeId && e.condition === AI_OFFERS_OUT)?.target;
  if (!start) return [];
  const out: { productId: string; headline?: string; button?: string }[] = [];
  const seen = new Set<string>();
  const queue: { id: string; depth: number; button?: string }[] = [{ id: start, depth: 0 }];
  while (queue.length) {
    const { id, depth, button } = queue.shift()!;
    if (seen.has(id) || depth > 4) continue;
    seen.add(id);
    const node = getNode(graph, id);
    if (!node || node.type === "ai" || node.type === "end") continue;
    if (node.type === "offer") {
      const c = node.content as { productId?: string; headline?: string };
      if (c.productId && !out.some((o) => o.productId === c.productId)) out.push({ productId: c.productId, headline: c.headline || undefined, button });
      continue;
    }
    const buttons = ((node.content as { buttons?: ChoiceButton[] }).buttons ?? []) as ChoiceButton[];
    for (const e of outgoingEdges(graph, id)) {
      if (e.condition?.startsWith("payment:")) continue;
      const label = e.condition?.startsWith("btn:") ? buttons.find((b) => `btn:${b.id}` === e.condition)?.label : undefined;
      queue.push({ id: e.target, depth: depth + 1, button: label ?? button });
    }
  }
  return out;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Tempo "digitando" proporcional ao texto: ~35ms por caractere, entre 1s e 6s. */
export function autoDelay(textLength: number): number {
  return clamp(Math.round(700 + textLength * 35), 1000, 6000);
}

/**
 * Atraso antes de uma mensagem. O nó pode ter tempo próprio (fixo, aleatório ou automático)
 * ou herdar o padrão do fluxo. Nós antigos com delayMs e sem modo contam como "fixo".
 */
export function resolveDelay(
  settings: DelaySettings | undefined,
  funnelDelay: FunnelDelay = DEFAULT_FUNNEL_DELAY,
  textLength = 0,
  rng = Math.random,
): number {
  const s = settings ?? {};
  const mode = s.delayMode && s.delayMode !== "inherit" ? s.delayMode : !s.delayMode && s.delayMs != null ? "fixed" : null;
  const d = mode
    ? { mode, ms: s.delayMs, minMs: s.delayMinMs, maxMs: s.delayMaxMs }
    : { mode: funnelDelay.mode, ms: funnelDelay.ms, minMs: funnelDelay.minMs, maxMs: funnelDelay.maxMs };
  if (d.mode === "auto") return autoDelay(textLength);
  if (d.mode === "random") {
    const min = clamp(d.minMs ?? 1000, 0, 60000);
    const max = clamp(d.maxMs ?? 4000, min, 60000);
    return Math.round(min + rng() * (max - min));
  }
  return clamp(d.ms ?? 1500, 0, 60000);
}

export interface GraphIssue {
  nodeId?: string;
  level: "error" | "warning";
  message: string;
}

/** Validação do fluxo antes de publicar. */
export function validateGraph(graph: FlowGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const starts = graph.nodes.filter((n) => n.type === "start");
  if (starts.length === 0) issues.push({ level: "error", message: "O fluxo precisa de um nó INÍCIO." });
  if (starts.length > 1) issues.push({ level: "error", message: "O fluxo deve ter apenas um nó INÍCIO." });

  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      issues.push({ level: "error", message: `Conexão ${e.id} aponta para um nó inexistente.` });
    }
  }

  const reachable = new Set<string>();
  const stack = starts.map((s) => s.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const e of outgoingEdges(graph, id)) stack.push(e.target);
  }

  for (const n of graph.nodes) {
    if (n.type !== "start" && !reachable.has(n.id)) {
      issues.push({ nodeId: n.id, level: "warning", message: "Nó não está conectado ao fluxo." });
    }
    const c = n.content as unknown as Record<string, unknown>;
    if (n.type === "buttons" || (n.type === "question" && c.mode === "buttons")) {
      const buttons = (c.buttons as { id: string; label: string }[] | undefined) ?? [];
      if (buttons.length === 0) issues.push({ nodeId: n.id, level: "error", message: "Adicione ao menos um botão." });
      for (const b of buttons) {
        if (!nextNodeId(graph, n.id, `btn:${b.id}`)) {
          issues.push({ nodeId: n.id, level: "warning", message: `Botão "${b.label}" não leva a nenhum nó.` });
        }
      }
    }
    if (n.type === "offer") {
      if (!c.productId) issues.push({ nodeId: n.id, level: "error", message: "Selecione um produto para a oferta." });
      if (!nextNodeId(graph, n.id, "payment:approved")) {
        issues.push({ nodeId: n.id, level: "warning", message: "Defina o próximo nó após PAGAMENTO APROVADO." });
      }
    }
    if ((n.type === "image" || n.type === "video" || n.type === "audio") && !c.url) {
      issues.push({ nodeId: n.id, level: "error", message: "Arquivo de mídia não definido." });
    }
    if (n.type === "tag" && !c.tagId) issues.push({ nodeId: n.id, level: "error", message: "Selecione uma tag." });
    if (n.type === "ai" && !c.brainId) issues.push({ nodeId: n.id, level: "error", message: "Selecione um cérebro para a IA." });
  }
  return issues;
}

/** Gera ids curtos e únicos dentro de um fluxo. */
export function shortId(prefix = "n"): string {
  const rnd = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return `${prefix}_${rnd}`;
}

/**
 * Conteúdo pago: nós alcançáveis apenas depois de uma conexão "payment:approved".
 * Esses nós nunca são enviados ao navegador antes da confirmação do pagamento.
 */
export function lockedNodeIds(graph: FlowGraph): Set<string> {
  const walk = (starts: string[], skipApproved: boolean) => {
    const seen = new Set<string>();
    const stack = [...starts];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const e of outgoingEdges(graph, id)) {
        if (skipApproved && e.condition === "payment:approved") continue;
        stack.push(e.target);
      }
    }
    return seen;
  };
  const free = walk(graph.nodes.filter((n) => n.type === "start").map((n) => n.id), true);
  const paidStarts = graph.edges.filter((e) => e.condition === "payment:approved").map((e) => e.target);
  const locked = new Set<string>();
  for (const id of walk(paidStarts, false)) if (!free.has(id)) locked.add(id);
  return locked;
}

/**
 * Nós das mensagens de apoio ("Enquanto não compra"): alcançados pela saída padrão de uma oferta,
 * sem passar por eventos de pagamento. Um "Fim" aqui não encerra a conversa (a oferta segue aberta).
 */
export function followUpNodeIds(graph: FlowGraph): Set<string> {
  const out = new Set<string>();
  const stack = graph.nodes
    .filter((n) => n.type === "offer")
    .flatMap((n) => outgoingEdges(graph, n.id).filter((e) => (e.condition || "default") === "default").map((e) => e.target));
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const e of outgoingEdges(graph, id)) if (!e.condition?.startsWith("payment:")) stack.push(e.target);
  }
  return out;
}

/** Nós pagos liberados pelos pagamentos aprovados das ofertas informadas. */
export function unlockedByOffers(graph: FlowGraph, paidOfferNodeIds: string[]): Set<string> {
  const locked = lockedNodeIds(graph);
  const out = new Set<string>();
  const stack = graph.edges
    .filter((e) => e.condition === "payment:approved" && paidOfferNodeIds.includes(e.source))
    .map((e) => e.target);
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id) || !locked.has(id)) continue;
    out.add(id);
    for (const e of outgoingEdges(graph, id)) {
      // conteúdo de outra oferta (upsell) só libera com o pagamento dela
      if (e.condition === "payment:approved" && !paidOfferNodeIds.includes(id)) continue;
      stack.push(e.target);
    }
  }
  return out;
}

/** Minúsculas, sem acentos, sem emojis/pontuação, espaços simples. */
export function normalizeAnswer(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resposta digitada → caminho. Compara com o rótulo e as palavras-chave de cada opção:
 * 1º igualdade exata, 2º a resposta contém a palavra-chave inteira (a mais longa vence),
 * 3º a palavra-chave contém a resposta.
 * Retorna null quando nada bate (o fluxo segue pela saída "qualquer outra resposta").
 */
export function matchChoice(buttons: ChoiceButton[], answer: string): ChoiceButton | null {
  const a = normalizeAnswer(answer);
  if (!a) return null;
  const options = buttons.map((b) => ({
    b,
    keys: [b.label, ...(b.keywords ?? "").split(",")].map(normalizeAnswer).filter(Boolean),
  }));
  for (const o of options) if (o.keys.includes(a)) return o.b;
  const padded = ` ${a} `;
  // a resposta contém a palavra-chave: vence a mais específica (mais longa)
  let best: { b: ChoiceButton; len: number } | null = null;
  for (const o of options) {
    for (const k of o.keys) {
      if (padded.includes(` ${k} `) && (!best || k.length > best.len)) best = { b: o.b, len: k.length };
    }
  }
  if (best) return best.b;
  if (a.length >= 3) for (const o of options) if (o.keys.some((k) => ` ${k} `.includes(padded))) return o.b;
  return null;
}
