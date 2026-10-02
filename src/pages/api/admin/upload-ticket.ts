import { z } from "zod";
import { apiHandler, rateLimit, requireAdmin } from "@/lib/api";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, createUploadTicket } from "@/services/storage";

const schema = z.object({
  mime: z.string().refine((m) => !!ALLOWED_MIME[m], "Tipo de arquivo não permitido"),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES, "Arquivo maior que 25MB"),
});

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    rateLimit(req, "upload-ticket", 60, 60_000);
    const { mime } = schema.parse(req.body);
    return createUploadTicket(mime);
  },
});
