#!/usr/bin/env bash
# Build na Vercel: aceita a URL do banco com os nomes usados pelas integrações (Neon, Supabase, Vercel Postgres).
set -euo pipefail
BASE_URL="${DATABASE_URL:-${POSTGRES_URL_NON_POOLING:-${POSTGRES_PRISMA_URL:-${POSTGRES_URL:-}}}}"
if [ -z "$BASE_URL" ]; then
  echo "ERRO: nenhum banco de dados conectado ao projeto."
  echo "Na Vercel: projeto > Storage > Create Database > Neon (Postgres) > Connect (Production e Preview). Depois faça Redeploy."
  exit 1
fi
# DB_SCHEMA: tabelas em schema próprio (evita conflito com bancos já em uso)
if [ -n "${DB_SCHEMA:-}" ] && [[ "$BASE_URL" != *"schema="* ]]; then
  if [[ "$BASE_URL" == *"?"* ]]; then BASE_URL="${BASE_URL}&schema=${DB_SCHEMA}"; else BASE_URL="${BASE_URL}?schema=${DB_SCHEMA}"; fi
fi
export DATABASE_URL="$BASE_URL"
npx prisma generate
# banco oscilando: tenta 3 vezes; se não conectar, publica assim mesmo (só é seguro sem migração nova — o aviso fica no log)
migrated=0
for i in 1 2 3; do
  if npx prisma migrate deploy; then migrated=1; break; fi
  echo "AVISO: migrate deploy falhou (tentativa $i/3); tentando de novo em 10 s"
  sleep 10
done
[ "$migrated" = 1 ] || echo "AVISO: migrações NÃO aplicadas (banco indisponível). Se este deploy trouxer migração nova, publique de novo quando o banco voltar."
# o seed só garante o admin inicial: banco oscilando nesse segundo não deve impedir a publicação
npx tsx database/seed.ts --if-enabled || echo "AVISO: seed não rodou (banco indisponível); seguindo com o build."
npx next build
