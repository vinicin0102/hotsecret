// Produtos no painel: o token da API de Conversões do pixel da oferta fica criptografado e nunca volta ao navegador.
import type { Prisma, Product } from "@prisma/client";
import { sealSecret } from "@/lib/secret-box";
import { productSchema } from "@/lib/validation";

/** Corpo validado → dados do banco (o token vira metaCapiTokenSealed). */
export function productData(body: unknown): Prisma.ProductUncheckedCreateInput {
  const { metaCapiToken, ...rest } = productSchema.parse(body);
  return {
    ...rest,
    ...(metaCapiToken === null ? { metaCapiTokenSealed: null } : typeof metaCapiToken === "string" ? { metaCapiTokenSealed: sealSecret(metaCapiToken) } : {}),
  };
}

/** Produto para o painel: sem o token, só se ele existe. */
export function adminProduct<T extends Product>(p: T) {
  const { metaCapiTokenSealed, ...rest } = p;
  return { ...rest, metaCapiConfigured: !!metaCapiTokenSealed };
}
