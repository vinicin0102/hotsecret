// Pixels padrão. O token da API de Conversões nunca é devolvido — só se está configurado.
import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { trackingIdsSchema } from "@/lib/validation";
import { getGlobalTracking, saveGlobalTracking } from "@/services/tracking-settings";

const schema = trackingIdsSchema.extend({
  /** undefined = manter o token atual; "" = remover */
  metaCapiToken: z.string().max(600).optional(),
  metaTestEventCode: z.string().max(40).regex(/^[A-Z0-9]*$/i, "Código de teste inválido").optional(),
});

export default apiHandler({
  GET: async (req) => {
    await requireAdmin(req);
    const t = await getGlobalTracking();
    return {
      tracking: {
        metaPixelId: t.metaPixelId ?? "",
        tiktokPixelId: t.tiktokPixelId ?? "",
        googleTagId: t.googleTagId ?? "",
        metaTestEventCode: t.metaTestEventCode ?? "",
        metaCapiConfigured: !!t.metaCapiToken,
        metaCapiHint: t.metaCapiToken ? `…${t.metaCapiToken.slice(-4)}` : "",
      },
    };
  },
  PUT: async (req) => {
    await requireAdmin(req);
    const body = schema.parse(req.body);
    const current = await getGlobalTracking();
    await saveGlobalTracking({
      metaPixelId: body.metaPixelId,
      tiktokPixelId: body.tiktokPixelId,
      googleTagId: body.googleTagId,
      metaTestEventCode: body.metaTestEventCode,
      metaCapiToken: body.metaCapiToken === undefined ? current.metaCapiToken : body.metaCapiToken.trim(),
    });
    return { ok: true };
  },
});
