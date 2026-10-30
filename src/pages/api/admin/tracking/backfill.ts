// Pixel novo: envia para ele as vendas aprovadas dos últimos 7 dias (limite da API de Conversões da Meta).
import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { backfillMetaPurchases } from "@/services/meta-capi";

export const config = { maxDuration: 60 };

const schema = z.object({ pixelId: z.string().trim().regex(/^\d{5,25}$/, "Pixel da Meta inválido") });

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    const { pixelId } = schema.parse(req.body);
    return backfillMetaPurchases(pixelId);
  },
});
