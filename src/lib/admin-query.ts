// Consultas pesadas do painel (estatísticas, contagens). Num banco pequeno, abrir o painel prendia todas as
// conexões e derrubava o chat dos leads. Aqui elas rodam numa conexão só (transação), com limite de 8 s por
// consulta (desistem sozinhas em vez de travar o banco) e o resultado fica guardado alguns minutos.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/memo";

const STATEMENT_TIMEOUT = "8s";

export function heavyAdminQuery<T>(key: string, ttlMs: number, run: (db: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return cached(`admin:${key}`, ttlMs, () =>
    prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`);
        return run(tx);
      },
      { maxWait: 5_000, timeout: 30_000 },
    ),
  );
}
