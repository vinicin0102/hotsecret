import { test } from "node:test";
import assert from "node:assert/strict";
import type { NextApiRequest } from "next";
import { leadRateLimit } from "../src/lib/api";

const req = (token: string | null, ip = "200.1.1.1") =>
  ({ body: token ? { token } : {}, headers: { "x-forwarded-for": ip }, socket: {} }) as unknown as NextApiRequest;

test("muitos leads atrás do mesmo IP (operadora) não se bloqueiam", () => {
  // 11 leads diferentes pagando no mesmo minuto, todos com o mesmo IP: o limite antigo (10 por IP) barrava o 11º
  for (let i = 0; i < 60; i++) assert.doesNotThrow(() => leadRateLimit(req(`token-lead-${i}-abcdefghij`), "t-checkout", 10, 60_000));
});

test("um mesmo lead passando do limite é barrado", () => {
  for (let i = 0; i < 10; i++) leadRateLimit(req("token-do-mesmo-lead-xyz"), "t-spam", 10, 60_000);
  assert.throws(() => leadRateLimit(req("token-do-mesmo-lead-xyz"), "t-spam", 10, 60_000), /Muitas requisições/);
});

test("o IP ainda tem um teto contra abuso", () => {
  // robô abrindo conversas sem parar: teto de 100x o limite por lead
  for (let i = 0; i < 300; i++) leadRateLimit(req(null, "9.9.9.9"), "t-session", 3, 60_000);
  assert.throws(() => leadRateLimit(req(null, "9.9.9.9"), "t-session", 3, 60_000), /Muitas requisições/);
});
