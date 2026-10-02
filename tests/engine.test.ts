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

test("atraso: fixo, aleatório, automático e padrão do fluxo", () => {
  assert.equal(resolveDelay({ delayMode: "fixed", delayMs: 3000 }), 3000);
  assert.equal(resolveDelay({ delayMs: 2500 }), 2500); // nós antigos sem modo = fixo
  assert.equal(resolveDelay({ delayMode: "random", delayMinMs: 1000, delayMaxMs: 4000 }, undefined, 0, () => 0), 1000);
  assert.equal(resolveDelay({ delayMode: "random", delayMinMs: 1000, delayMaxMs: 4000 }, undefined, 0, () => 1), 4000);
  assert.equal(resolveDelay({ delayMode: "fixed", delayMs: 999999 }), 60000);
  // automático: texto curto ≥ 1s, texto longo ≤ 6s, e cresce com o tamanho
  assert.equal(resolveDelay({ delayMode: "auto" }, undefined, 5), 1000);
  assert.equal(resolveDelay({ delayMode: "auto" }, undefined, 5000), 6000);
  assert.ok(resolveDelay({ delayMode: "auto" }, undefined, 120) > resolveDelay({ delayMode: "auto" }, undefined, 40));
  // herda o padrão do fluxo
  assert.equal(resolveDelay({}, { mode: "fixed", ms: 2000 }), 2000);
  assert.equal(resolveDelay({ delayMode: "inherit", delayMs: 500 }, { mode: "fixed", ms: 3000 }), 3000);
  assert.equal(resolveDelay(undefined, { mode: "random", minMs: 2000, maxMs: 2000 }), 2000);
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

test("conteúdo pago: só nós depois de payment:approved ficam bloqueados", async () => {
  const { lockedNodeIds, unlockedByOffers } = await import("../src/features/chat-engine/engine");
  const g: FlowGraph = {
    nodes: [
      ...graph.nodes,
      { id: "fail", type: "text", content: { text: "recusado" }, settings: {}, position: { x: 0, y: 0 } },
      { id: "secret2", type: "image", content: { url: "/x.png" }, settings: {}, position: { x: 0, y: 0 } },
    ],
    edges: [
      ...graph.edges,
      { id: "6", source: "o", target: "fail", condition: "payment:failed" },
      { id: "7", source: "ok", target: "secret2", condition: "default" },
    ],
  };
  const locked = lockedNodeIds(g);
  assert.deepEqual([...locked].sort(), ["ok", "secret2"]);
  assert.deepEqual([...unlockedByOffers(g, ["o"])].sort(), ["ok", "secret2"]);
  assert.equal(unlockedByOffers(g, []).size, 0);
});

test("upsell: comprar a 1ª oferta não libera o conteúdo da 2ª", async () => {
  const { lockedNodeIds, unlockedByOffers } = await import("../src/features/chat-engine/engine");
  const t = (id: string) => ({ id, type: "text" as const, content: { text: id }, settings: {}, position: { x: 0, y: 0 } });
  const o = (id: string) => ({ id, type: "offer" as const, content: { productId: "p" }, settings: {}, position: { x: 0, y: 0 } });
  const g: FlowGraph = {
    nodes: [
      { id: "start", type: "start", content: {} as never, settings: {}, position: { x: 0, y: 0 } },
      o("oA"), t("contA"), o("oB"), t("contB"),
    ],
    edges: [
      { id: "1", source: "start", target: "oA", condition: "default" },
      { id: "2", source: "oA", target: "contA", condition: "payment:approved" },
      { id: "3", source: "contA", target: "oB", condition: "default" },
      { id: "4", source: "oB", target: "contB", condition: "payment:approved" },
    ],
  };
  assert.deepEqual([...lockedNodeIds(g)].sort(), ["contA", "contB", "oB"]);
  assert.deepEqual([...unlockedByOffers(g, ["oA"])].sort(), ["contA", "oB"]);
  assert.deepEqual([...unlockedByOffers(g, ["oA", "oB"])].sort(), ["contA", "contB", "oB"]);
});

test("resposta digitada encontra o caminho certo", async () => {
  const { matchChoice } = await import("../src/features/chat-engine/engine");
  const buttons = [
    { id: "sim", label: "Sim ❤️", keywords: "claro, com certeza, aham" },
    { id: "nao", label: "Não", keywords: "nunca" },
    { id: "talvez", label: "Não sei" },
  ];
  assert.equal(matchChoice(buttons, "SIM")?.id, "sim");
  assert.equal(matchChoice(buttons, "claro que sim!!")?.id, "sim");
  assert.equal(matchChoice(buttons, "com certeza")?.id, "sim");
  assert.equal(matchChoice(buttons, "nao")?.id, "nao");
  assert.equal(matchChoice(buttons, "acho que não sei")?.id, "talvez"); // a chave mais específica vence
  assert.equal(matchChoice(buttons, "não sei")?.id, "talvez"); // igualdade exata vence
  assert.equal(matchChoice(buttons, "eu gosto de pizza"), null);
  assert.equal(matchChoice(buttons, "   "), null);
});
