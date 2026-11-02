// Cache curto em memória (por instância do servidor) para leituras que se repetem a cada visita do lead
// (estrutura do fluxo, pixels, experimento, cérebro). Alivia o banco em picos de tráfego; uma edição no
// painel aparece no fluxo publicado em até alguns segundos. Pedidos simultâneos dividem a mesma consulta.
const store = new Map<string, { at: number; value: Promise<unknown> }>();
const MAX = 500;

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), value });
  // erro não fica guardado: o próximo pedido tenta de novo
  value.catch(() => store.get(key)?.value === value && store.delete(key));
  if (store.size > MAX) store.delete(store.keys().next().value!);
  return value;
}

/** o painel salvou: esta instância esquece na hora (as outras em até ttl) */
export function forget(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
