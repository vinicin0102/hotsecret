import { test } from "node:test";
import assert from "node:assert/strict";
import { validateGraph } from "../src/features/chat-engine/engine";
import type { FlowGraph, FlowNode } from "../src/types/flow";

const node = (id: string, type: FlowNode["type"], content: Record<string, unknown> = {}): FlowNode =>
  ({ id, type, content, settings: {}, position: { x: 0, y: 0 } }) as unknown as FlowNode;

test("bloco solto incompleto não impede publicar (só avisa); bloco ligado incompleto impede", () => {
  const g: FlowGraph = {
    nodes: [
      node("start", "start"),
      node("t1", "text", { text: "oi" }),
      // soltos e incompletos: oferta sem produto, imagem sem arquivo
      node("of_solta", "offer", { productId: "" }),
      node("img_solta", "image", { url: "" }),
    ],
    edges: [{ id: "e1", source: "start", target: "t1", condition: "default" }],
  };
  const issues = validateGraph(g);
  assert.equal(issues.filter((i) => i.level === "error").length, 0, "nada solto bloqueia");
  assert.equal(issues.filter((i) => i.loose).length, 2);

  g.edges.push({ id: "e2", source: "t1", target: "img_solta", condition: "default" });
  const after = validateGraph(g);
  assert.deepEqual(after.filter((i) => i.level === "error").map((i) => i.nodeId), ["img_solta"], "ligado e sem arquivo bloqueia");
});

test("erros vêm primeiro na lista (não ficam escondidos atrás dos avisos)", () => {
  const nodes = [node("start", "start"), ...Array.from({ length: 15 }, (_, i) => node(`solto${i}`, "text", { text: "x" })), node("of", "offer", { productId: "" })];
  const issues = validateGraph({ nodes, edges: [{ id: "e", source: "start", target: "of", condition: "default" }] });
  assert.equal(issues[0].level, "error");
  assert.equal(issues[0].nodeId, "of");
});
