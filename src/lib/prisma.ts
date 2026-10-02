import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function addParam(url: string, key: string, value: string): string {
  if (new RegExp(`[?&]${key}=`).test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;
}

/**
 * URL do banco em tempo de execução. Integrações da Vercel expõem nomes diferentes
 * (Neon: DATABASE_URL; Supabase: POSTGRES_PRISMA_URL = pooler de transações).
 * Em serverless usamos o pooler de transações com 1 conexão por instância — a conexão
 * "direta"/de sessão do Supabase aceita poucos clientes e esgota com tráfego.
 * Com DB_SCHEMA, as tabelas ficam em um schema próprio (bancos compartilhados).
 */
export function resolveDatabaseUrl(): string | undefined {
  let url =
    process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) return url;
  if (process.env.DB_SCHEMA) url = addParam(url, "schema", process.env.DB_SCHEMA);
  const pooled = /pgbouncer=true|:6543\b|pooler\./.test(url) && !/:5432\b/.test(url.replace(/\?.*$/, "").split("@").pop() ?? "");
  if (pooled) {
    url = addParam(url, "pgbouncer", "true");
    url = addParam(url, "connection_limit", "1");
  } else if (process.env.VERCEL) {
    url = addParam(url, "connection_limit", "1");
  }
  return url;
}

/** Schema das tabelas — usado para qualificar o SQL escrito à mão (seguro com pooler de transações). */
function currentSchema(): string {
  const fromUrl = /[?&]schema=([^&]+)/.exec(resolveDatabaseUrl() ?? "")?.[1];
  return decodeURIComponent(process.env.DB_SCHEMA || fromUrl || "public").replace(/[^a-zA-Z0-9_]/g, "") || "public";
}

/** Nome de tabela qualificado para $queryRaw: tbl("events") → "hotsecret"."events" */
export function tbl(name: string): Prisma.Sql {
  return Prisma.raw(`"${currentSchema()}"."${name.replace(/[^a-z_]/g, "")}"`);
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolveDatabaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// reutiliza o cliente entre invocações da mesma instância (dev e serverless)
globalForPrisma.prisma = prisma;
