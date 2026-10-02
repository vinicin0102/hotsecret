#!/usr/bin/env bash
# Build na Vercel: aceita a URL do banco com os nomes usados pelas integrações (Neon, Supabase, Vercel Postgres).
set -euo pipefail
export DATABASE_URL="${DATABASE_URL:-${POSTGRES_PRISMA_URL:-${POSTGRES_URL:-}}}"
if [ -z "$DATABASE_URL" ]; then
  echo "ERRO: nenhum banco de dados conectado ao projeto."
  echo "Na Vercel: projeto > Storage > Create Database > Neon (Postgres) > Connect (Production e Preview). Depois faça Redeploy."
  exit 1
fi
# migrations e seed usam conexão direta (poolers em modo transação não suportam migrations)
DIRECT_URL="${POSTGRES_URL_NON_POOLING:-$DATABASE_URL}"
npx prisma generate
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
DATABASE_URL="$DIRECT_URL" npx tsx database/seed.ts --if-enabled
npx next build
