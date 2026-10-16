import { test } from "node:test";
import assert from "node:assert/strict";
import { currencyOfLocale, productOption } from "../src/lib/format";

test("país do fluxo define a moeda cobrada", () => {
  assert.equal(currencyOfLocale("pt-BR"), "BRL");
  assert.equal(currencyOfLocale(undefined), "BRL");
  assert.equal(currencyOfLocale("es-MX"), "MXN");
  assert.equal(currencyOfLocale("es-AR"), "ARS");
});

test("opção de produto no painel mostra a moeda real", () => {
  assert.match(productOption({ name: "vip", price: 3771, currency: "BRL" }), /^vip · R\$\s?37,71$/);
  const mx = productOption({ name: "vip", price: 3771, currency: "MXN" });
  assert.ok(!mx.includes("R$"), mx);
  assert.match(mx, /37,71 \(MXN\)$/);
});
