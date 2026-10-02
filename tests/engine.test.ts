import { test } from "node:test";
import assert from "node:assert/strict";
import { nextNodeId, resolveDelay, validateGraph } from "../src/features/chat-engine/engine";
import type { FlowGraph } from "../src/types/flow";

const graph: FlowGraph = {
  nodes: [
    { id: "start", type: "start", content: {} as never, settings: {}, position: { x: 0, y: 0 } },
    { id: "q", type: "buttons", content: { text: "Você quer descobrir?", buttons: [{ id: "sim", label: "SIM" }, { id: "talvez", label: "TALVEZ" }] }, settings: {}, position: { x: 0, y: 0 } },
    { id: "a", type: "text", content: { text: "A" }, settings: {}, position: { x: 0, y: 0 } },
    { id: "b", type: "text", content: { text: "B" }, settings: {}, position: { x: 0, y: 0 } },
    { id: "o", type: "offer", content: { productId: "p1" }, settings: {}, position: { x: 0, y: 0 } },
    { id: "ok", type: "text", content: { text: "ok" }, settings: {}, position: { x: 0, y: 0 } },
  ],
  edges: [
    { id: "1", source: "start", target: "q", condition: "default" },
    { id: "2", source: "q", target: "a", condition: "btn:sim" },
    { id: "3", source: "q", target: "b", condition: "default" },
    { id: "4", source: "a", target: "o", condition: "default" },
    { id: "5", source: "o", target: "ok", condition: "payment:approved" },
  ],
};

test("cada botão leva ao nó correspondente", () => {
  assert.equal(nextNodeId(graph, "start"), "q");
  assert.equal(nextNodeId(graph, "q", "btn:sim"), "a");
});

test("botão sem conexão própria usa a conexão default", () => {
  assert.equal(nextNodeId(graph, "q", "btn:talvez"), "b");
});

test("eventos de pagamento nunca caem no default", () => {
  assert.equal(nextNodeId(graph, "o", "payment:approved"), "ok");
  assert.equal(nextNodeId(graph, "o", "payment:failed"), null);
});

test("delay fixo e aleatório", () => {
  assert.equal(resolveDelay({ delayMs: 3000 }), 3000);
  assert.equal(resolveDelay({ delayMode: "random", delayMinMs: 1000, delayMaxMs: 4000 }, 0, () => 0), 1000);
  assert.equal(resolveDelay({ delayMode: "random", delayMinMs: 1000, delayMaxMs: 4000 }, 0, () => 1), 4000);
  assert.equal(resolveDelay({ delayMs: 999999 }), 60000);
});

test("validação aponta nós soltos e saídas faltando", () => {
  const issues = validateGraph({
    nodes: [...graph.nodes, { id: "x", type: "text", content: { text: "solto" }, settings: {}, position: { x: 0, y: 0 } }],
    edges: graph.edges.filter((e) => e.id !== "3"), // TALVEZ sem destino e sem fallback
  });
  assert.ok(issues.some((i) => i.nodeId === "x" && i.level === "warning"));
  assert.ok(issues.some((i) => i.nodeId === "q" && i.message.includes("TALVEZ")));
  assert.ok(!issues.some((i) => i.level === "error"));
  assert.ok(validateGraph({ nodes: [], edges: [] }).some((i) => i.level === "error"));
});
