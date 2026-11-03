import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { userDataOf } from "../src/services/meta-capi";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const lead = (p: Record<string, unknown>) => ({ id: "lead1", clientIp: "1.2.3.4", userAgent: "UA", fbp: null, fbc: null, country: "BR", email: null, phone: null, ...p }) as never;

test("correspondência: telefone com DDI do país (só dígitos), e-mail minúsculo, tudo com hash", () => {
  const u = userDataOf(lead({ phone: "(11) 98888-7777", email: " Fulano@Mail.com " }));
  assert.deepEqual(u.ph, [sha("5511988887777")]);
  assert.deepEqual(u.em, [sha("fulano@mail.com")]);
  assert.deepEqual(u.external_id, [sha("lead1")]);
  assert.deepEqual(u.country, [sha("br")]);
  assert.equal(u.client_ip_address, "1.2.3.4");
});

test("correspondência: telefone já com DDI fica igual; inválido e e-mail ruim não vão", () => {
  assert.deepEqual(userDataOf(lead({ phone: "+52 55 1234 5678", country: "MX" })).ph, [sha("525512345678")]);
  const u = userDataOf(lead({ phone: "123", email: "não é email" }));
  assert.equal(u.ph, undefined);
  assert.equal(u.em, undefined);
});
