// Flow Engine puro (sem React, sem rede) — usado pelo chat público, pelo preview e pelos testes.
import type { DelaySettings, FlowEdge, FlowGraph, FlowNode } from "@/types/flow";

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
 * ("default", "btn:<id>", "payment:approved", "payment:failed").
 * Quando não existe conexão para a condição específica, usa a conexão "default".
 */
export function nextNodeId(graph: FlowGraph, nodeId: string, condition = "default"): string | null {
  const edges = outgoingEdges(graph, nodeId);
  const exact = edges.find((e) => e.condition === condition);
  if (exact) return exact.target;
  if (condition.startsWith("payment:")) return null; // eventos de pagamento nunca caem no default
  const fallback = edges.find((e) => e.condition === "default" || !e.condition);
  return fallback ? fallback.target : null;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Delay configurado no nó: fixo (ex.: 1000ms, 3000ms) ou aleatório (ex.: 1000–4000ms). */
export function resolveDelay(settings: DelaySettings | undefined, fallbackMs = 1200, rng = Math.random): number {
  const s = settings ?? {};
  if (s.delayMode === "random") {
    const min = clamp(s.delayMinMs ?? 1000, 0, 60000);
    const max = clamp(s.delayMaxMs ?? 4000, min, 60000);
    return Math.round(min + rng() * (max - min));
  }
  return clamp(s.delayMs ?? fallbackMs, 0, 60000);
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
  }
  return issues;
}

/** Gera ids curtos e únicos dentro de um fluxo. */
export function shortId(prefix = "n"): string {
  const rnd = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  return `${prefix}_${rnd}`;
}
