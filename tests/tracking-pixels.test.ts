import { test } from "node:test";
import assert from "node:assert/strict";
import { globalMetaPixels, mergeTracking, publicTracking } from "../src/services/tracking-settings";

// várias contas de anúncio: cada uma com o seu pixel da Meta, todos recebendo os eventos
const GLOBAL = { metaPixels: [{ id: "111111" }, { id: "222222" }], tiktokPixelId: "CTIKTOK0001" };

test("padrão: todos os pixels da Meta das Configurações", () => {
  const t = mergeTracking(GLOBAL);
  assert.deepEqual(t.metaPixelIds, ["111111", "222222"]);
  assert.equal(t.metaPixelId, "111111");
  assert.equal(t.tiktokPixelId, "CTIKTOK0001");
});

test("fluxo com pixels próprios: substitui, ou soma com os padrão se marcado", () => {
  assert.deepEqual(mergeTracking(GLOBAL, { metaPixelIds: ["333333"] }).metaPixelIds, ["333333"]);
  assert.deepEqual(mergeTracking(GLOBAL, { metaPixelIds: ["333333", "111111"], metaWithDefault: true }).metaPixelIds, ["111111", "222222", "333333"]);
  // o pixel único de antes (fluxo antigo) continua substituindo
  assert.deepEqual(mergeTracking(GLOBAL, { metaPixelId: "444444" }).metaPixelIds, ["444444"]);
});

test("configuração antiga (um pixel + token em texto) continua valendo", () => {
  const old = { metaPixelId: "555555", metaCapiToken: "tok-antigo" };
  assert.deepEqual(mergeTracking(old).metaPixelIds, ["555555"]);
  assert.deepEqual(globalMetaPixels(old), [{ id: "555555", token: "tok-antigo" }]);
});

test("página do chat: só os IDs, sem tokens", () => {
  const pub = publicTracking(mergeTracking({ ...GLOBAL, metaCapiToken: "segredo" } as never));
  assert.deepEqual(pub, { metaPixelIds: ["111111", "222222"], metaPixelId: "111111", tiktokPixelId: "CTIKTOK0001" });
  assert.ok(!JSON.stringify(pub).includes("segredo"));
});
