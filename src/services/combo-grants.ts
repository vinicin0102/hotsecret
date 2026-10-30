// Combo do Cérebro: comprar o produto do combo vale como ter comprado os produtos incluídos nele.
// Só lê o banco (o vip.ts usa este módulo; o combo.ts, que entrega os links, usa o vip.ts).
import { prisma } from "@/lib/prisma";

interface ComboRow {
  style?: string;
  productId?: string;
  comboProductIds?: string[];
}

async function allCombos(): Promise<ComboRow[]> {
  const brains = await prisma.brain.findMany({ select: { offers: true } });
  return brains.flatMap((b) => (Array.isArray(b.offers) ? (b.offers as ComboRow[]) : [])).filter((o) => o?.style === "combo" && !!o.productId);
}

/** os produtos comprados + os incluídos nos combos comprados */
export async function withComboProducts(owned: Iterable<string>): Promise<Set<string>> {
  const set = new Set(owned);
  if (!set.size) return set;
  for (const o of await allCombos()) if (set.has(o.productId!)) for (const id of o.comboProductIds ?? []) set.add(id);
  return set;
}

/** produtos de combos que incluem algum destes produtos */
export async function combosIncluding(productIds: Set<string>): Promise<Set<string>> {
  const out = new Set<string>();
  if (!productIds.size) return out;
  for (const o of await allCombos()) if (o.comboProductIds?.some((id) => productIds.has(id))) out.add(o.productId!);
  return out;
}
