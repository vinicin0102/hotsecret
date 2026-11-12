import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUtm, dayStart, dayEnd } from "../src/services/ads/report";
import { normalizeAccountId } from "../src/services/ads/meta-ads";

test("UTM no padrão UTMify: nome|id; sem id, só o nome", () => {
  assert.deepEqual(parseUtm("CBO Frio | Morena|120211000000001"), { name: "CBO Frio | Morena", id: "120211000000001" });
  assert.deepEqual(parseUtm("Remarketing"), { name: "Remarketing", id: "" });
  assert.deepEqual(parseUtm("Campanha|abc"), { name: "Campanha|abc", id: "" });
  assert.equal(parseUtm(""), null);
  assert.equal(parseUtm(null), null);
});

test("dias do relatório no horário de Brasília", () => {
  assert.equal(dayStart("2026-11-12").toISOString(), "2026-11-12T03:00:00.000Z");
  assert.equal(dayEnd("2026-11-12").toISOString(), "2026-11-13T02:59:59.999Z");
});

test("conta de anúncios: ID, act_ID ou link do gerenciador", () => {
  assert.equal(normalizeAccountId("123456789012345"), "act_123456789012345");
  assert.equal(normalizeAccountId("act_123456789012345"), "act_123456789012345");
  assert.equal(normalizeAccountId("https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123456789012345&nav_entry_point=bm"), "act_123456789012345");
  assert.equal(normalizeAccountId("minha conta"), null);
});
