import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryPointsToGroup, postAccess, postUnlocked, vipMedia, vipSettings } from "../src/services/vip";

test("quem vê cada post", () => {
  const owned = new Set(["p1"]);
  assert.equal(postUnlocked({ access: "free", productId: null }, false, new Set()), true);
  assert.equal(postUnlocked({ access: "vip", productId: null }, false, owned), false);
  assert.equal(postUnlocked({ access: "vip", productId: null }, true, new Set()), true);
  // pago à parte: a assinatura não libera, só o produto do post
  assert.equal(postUnlocked({ access: "paid", productId: "p2" }, true, owned), false);
  assert.equal(postUnlocked({ access: "paid", productId: "p1" }, false, owned), true);
  // pago sem produto vale como VIP
  assert.equal(postAccess({ access: "paid", productId: null }), "vip");
  assert.equal(postAccess({ access: "qualquer", productId: null }), "vip");
});

test("link de entrega que dá acesso ao grupo", () => {
  assert.ok(deliveryPointsToGroup("https://site.app/hot-secret/g/bianca", "bianca"));
  assert.ok(deliveryPointsToGroup("https://site.app/hot-secret/g/bianca?x=1", "bianca"));
  assert.ok(deliveryPointsToGroup("/hot-secret/g/bianca/", "bianca"));
  assert.ok(!deliveryPointsToGroup("https://site.app/hot-secret/g/bianca-2", "bianca"));
  assert.ok(!deliveryPointsToGroup("https://drive.google.com/x", "bianca"));
  assert.ok(!deliveryPointsToGroup(null, "bianca"));
});

test("mídia e configurações vindas do banco", () => {
  assert.deepEqual(vipMedia([{ url: "/a.jpg", kind: "image", preview: "/p.jpg" }, { url: "/b.mp4", kind: "video" }, { kind: "image" }, null]), [
    { url: "/a.jpg", kind: "image", preview: "/p.jpg" },
    { url: "/b.mp4", kind: "video" },
  ]);
  assert.deepEqual(vipMedia("x"), []);
  assert.deepEqual(vipSettings({ headline: " Oi ", perks: ["a", "", 3], ctaLabel: "" }), { headline: "Oi", perks: ["a"] });
});
