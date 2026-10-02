import { test } from "node:test";
import assert from "node:assert/strict";
// importa antes de mexer no ambiente: o @prisma/client carrega o .env local na importação
import { resolveDatabaseUrl } from "../src/lib/prisma";

async function resolve(env: Record<string, string | undefined>) {
  const keys = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "DB_SCHEMA", "VERCEL"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  const out = resolveDatabaseUrl();
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  return out;
}

test("Supabase na Vercel: usa o pooler de transações com 1 conexão e schema próprio", async () => {
  const url = await resolve({
    POSTGRES_PRISMA_URL: "postgres://u:p@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true",
    POSTGRES_URL_NON_POOLING: "postgres://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    DB_SCHEMA: "hotsecret",
    VERCEL: "1",
  });
  assert.match(url!, /:6543\//);
  assert.match(url!, /schema=hotsecret/);
  assert.match(url!, /pgbouncer=true/);
  assert.match(url!, /connection_limit=1/);
});

test("pooler sem pgbouncer=true recebe o parâmetro", async () => {
  const url = await resolve({ POSTGRES_PRISMA_URL: "postgres://u:p@x.pooler.supabase.com:6543/postgres", VERCEL: "1" });
  assert.match(url!, /pgbouncer=true/);
});

test("conexão de sessão (5432) não é tratada como pgbouncer, mas limita conexões na Vercel", async () => {
  const url = await resolve({ POSTGRES_URL_NON_POOLING: "postgres://u:p@x.pooler.supabase.com:5432/postgres", VERCEL: "1" });
  assert.doesNotMatch(url!, /pgbouncer/);
  assert.match(url!, /connection_limit=1/);
});

test("desenvolvimento local fica intacto", async () => {
  assert.equal(await resolve({ DATABASE_URL: "postgresql://a:b@localhost:5432/db" }), "postgresql://a:b@localhost:5432/db");
});
