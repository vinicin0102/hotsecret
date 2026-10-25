import { test } from "node:test";
import assert from "node:assert/strict";
import { showcaseChatHref, showcaseData, showcaseItems, showcaseSchema } from "../src/services/showcase";

test("link do chat: estilo escolhido na vitrine vai no parâmetro; sem escolha, vale o do fluxo", () => {
  assert.equal(showcaseChatHref("bianca", "messenger"), "/f/bianca?chat=whatsapp");
  assert.equal(showcaseChatHref("bianca", "default"), "/f/bianca?chat=secret");
  assert.equal(showcaseChatHref("bianca", null), "/f/bianca");
  assert.equal(showcaseChatHref("bianca"), "/f/bianca");
});

test("salvar: limpa campos vazios e destaques em branco", () => {
  const d = showcaseSchema.parse({
    name: "Modelos BR",
    slug: "Modelos-BR",
    items: [
      { id: "m1", funnelId: "f1", name: "", bio: "24 anos", tags: ["📸 Fotos", "", "🎥 Chamada"], chat: "messenger" },
      { id: "m2", funnelId: "f2", chat: null },
    ],
  });
  assert.equal(d.slug, "modelos-br");
  const data = showcaseData(d);
  assert.deepEqual(data.items, [
    { id: "m1", funnelId: "f1", bio: "24 anos", tags: ["📸 Fotos", "🎥 Chamada"], chat: "messenger" },
    { id: "m2", funnelId: "f2" },
  ]);
  assert.equal(data.published, false);
  assert.equal(data.locale, "pt-BR");
});

test("validação: fluxo obrigatório, link e foto válidos", () => {
  assert.equal(showcaseSchema.safeParse({ name: "x", slug: "ok", items: [{ id: "m1", funnelId: "" }] }).success, false);
  assert.equal(showcaseSchema.safeParse({ name: "x", slug: "com espaço", items: [] }).success, false);
  assert.equal(showcaseSchema.safeParse({ name: "x", slug: "ok", items: [{ id: "m1", funnelId: "f1", photoUrl: "javascript:alert(1)" }] }).success, false);
  assert.equal(showcaseSchema.safeParse({ name: "x", slug: "ok", items: [{ id: "m1", funnelId: "f1", photoUrl: "/hot-secret/api/uploads/a.jpg" }] }).success, true);
});

test("itens salvos: ignora entradas inválidas", () => {
  assert.deepEqual(showcaseItems([{ id: "m1", funnelId: "f1" }, null, { id: 3 }, "x"]), [{ id: "m1", funnelId: "f1" }]);
  assert.deepEqual(showcaseItems(null), []);
});
