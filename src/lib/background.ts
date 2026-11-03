// Tarefa em segundo plano: a resposta sai já e a função da Vercel espera a tarefa terminar (waitUntil do
// contexto da requisição, o mesmo que o pacote @vercel/functions faz); fora da Vercel, o processo segue rodando.
export function inBackground(task: Promise<unknown>, label = "background") {
  const holder = (globalThis as unknown as Record<symbol, { get?: () => { waitUntil?: (p: Promise<unknown>) => void } } | undefined>)[
    Symbol.for("@vercel/request-context")
  ];
  const safe = task.catch((e) => console.error(`[${label}]`, e instanceof Error ? e.message.slice(0, 300) : e));
  holder?.get?.()?.waitUntil?.(safe);
}
