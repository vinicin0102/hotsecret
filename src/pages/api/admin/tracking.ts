// Pixels padrão. Meta: lista de pixels (uma conta de anúncios cada), cada um com o seu token da API de Conversões.
// Os tokens nunca são devolvidos — só se estão configurados (e os 4 últimos caracteres).
import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { trackingIdsSchema } from "@/lib/validation";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { getGlobalTracking, globalMetaPixels, saveGlobalTracking, type StoredMetaPixel } from "@/services/tracking-settings";

const schema = trackingIdsSchema.pick({ tiktokPixelId: true, googleTagId: true }).extend({
  metaPixels: z
    .array(
      z.object({
        id: z.string().trim().regex(/^\d{5,25}$/, "Pixel da Meta: use só os números do ID do pixel"),
        /** undefined = manter o token atual; "" = remover; texto = novo */
        token: z.string().trim().max(600).optional(),
      }),
    )
    .max(20)
    .default([])
    .refine((l) => new Set(l.map((p) => p.id)).size === l.length, "Pixel da Meta repetido"),
  metaTestEventCode: z.string().max(40).regex(/^[A-Z0-9]*$/i, "Código de teste inválido").optional(),
  /** token da API de Eventos do TikTok: undefined = manter o atual; "" = remover; texto = novo */
  tiktokToken: z.string().trim().max(600).optional(),
  tiktokTestEventCode: z.string().max(40).regex(/^[A-Z0-9]*$/i, "Código de teste do TikTok inválido").optional(),
});

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const t = await getGlobalTracking();
    const tiktokToken = t.tiktokTokenSealed ? openSecret(t.tiktokTokenSealed) : null;
    return {
      tracking: {
        metaPixels: globalMetaPixels(t).map((p) => ({ id: p.id, tokenConfigured: !!p.token, tokenHint: p.token ? `…${p.token.slice(-4)}` : "" })),
        tiktokPixelId: t.tiktokPixelId ?? "",
        googleTagId: t.googleTagId ?? "",
        metaTestEventCode: t.metaTestEventCode ?? "",
        tiktokTokenConfigured: !!tiktokToken,
        tiktokTokenHint: tiktokToken ? `…${tiktokToken.slice(-4)}` : "",
        tiktokTestEventCode: t.tiktokTestEventCode ?? "",
      },
    };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const body = schema.parse(req.body);
    const saved = await getGlobalTracking();
    const current = new Map(globalMetaPixels(saved).map((p) => [p.id, p.token]));
    // token do TikTok: sem campo no pedido, mantém o salvo (já criptografado); vazio remove; texto novo é criptografado
    const tiktokTokenSealed = body.tiktokToken === undefined ? saved.tiktokTokenSealed : body.tiktokToken ? sealSecret(body.tiktokToken) : undefined;
    const metaPixels: StoredMetaPixel[] = body.metaPixels.map((p) => {
      const token = p.token === undefined ? current.get(p.id) : p.token;
      return { id: p.id, ...(token ? { tokenSealed: sealSecret(token) } : {}) };
    });
    // o 1º pixel continua em metaPixelId (o que lê o formato antigo); o token antigo em texto sai — agora vai criptografado
    await saveGlobalTracking({
      metaPixels,
      metaPixelId: metaPixels[0]?.id,
      tiktokPixelId: body.tiktokPixelId,
      googleTagId: body.googleTagId,
      metaTestEventCode: body.metaTestEventCode,
      tiktokTokenSealed,
      tiktokTestEventCode: body.tiktokTestEventCode,
    });
    return { ok: true };
  },
});
