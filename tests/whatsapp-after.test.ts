import { test } from "node:test";
import assert from "node:assert/strict";
import { publicMarker, whatsappLinkForProduct } from "../src/lib/whatsapp";
import { publicNode } from "../src/services/funnels";
import { publicOfferFormat } from "../src/services/ai/brain";
import type { FlowNode } from "../src/types/flow";

// oferta no tema WhatsApp com número: pagou, botão para o WhatsApp — o número nunca vai ao navegador antes
const WA = { phone: "+55 11 98765-4321", message: "oi" };

test("bloco de oferta: o número sai do fluxo público; só com o tema WhatsApp vira whatsappAfter", () => {
  const node = { id: "of", type: "offer", content: { productId: "p", style: "live", vip: { theme: "whatsapp" }, whatsapp: WA } } as unknown as FlowNode;
  const pub = publicNode(node);
  assert.ok(!JSON.stringify(pub).includes("98765"));
  assert.equal((pub.content as { whatsappAfter?: boolean }).whatsappAfter, true);
  const off = publicNode({ ...node, content: { ...(node.content as object), vip: {} } } as FlowNode);
  assert.ok(!JSON.stringify(off).includes("98765"));
  assert.equal((off.content as { whatsappAfter?: boolean }).whatsappAfter, undefined);
});

test("marcador do vídeo: oferta no tema WhatsApp ganha o botão; no tema padrão o número fica guardado e desligado", () => {
  const on = publicMarker({ id: "m", at: 0, label: "x", productId: "p", style: "offer" as const, vip: { theme: "whatsapp" as const }, whatsapp: WA });
  assert.equal(on.whatsappAfter, true);
  assert.equal("whatsapp" in on, false);
  const off = publicMarker({ id: "m", at: 0, label: "x", productId: "p", style: "offer" as const, vip: {}, whatsapp: WA });
  assert.equal(off.whatsappAfter, undefined);
  assert.equal(whatsappLinkForProduct([{ style: "offer", productId: "p", vip: {}, whatsapp: WA }], "p"), null);
  assert.equal(whatsappLinkForProduct([{ style: "offer", productId: "x", basicProductId: "p", vip: { theme: "whatsapp" }, whatsapp: WA }], "p"), "https://wa.me/5511987654321?text=oi");
});

test("Cérebro: oferta do canal VIP/botão no tema WhatsApp com número → whatsappAfter, sem o número", () => {
  const f = publicOfferFormat({ id: "o", productId: "p", style: "live", button: true, vip: { theme: "whatsapp" }, whatsapp: WA });
  assert.equal(f.whatsappAfter, true);
  assert.ok(!JSON.stringify(f).includes("98765"));
  assert.equal(publicOfferFormat({ id: "o", productId: "p", style: "live", vip: {}, whatsapp: WA }).whatsappAfter, undefined);
});
