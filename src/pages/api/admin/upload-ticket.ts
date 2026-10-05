import { z } from "zod";
import { apiHandler, HttpError, rateLimit, requireAdmin } from "@/lib/api";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, UploadTooLargeError, createUploadTicket } from "@/services/storage";

const schema = z.object({
  mime: z.string().refine((m) => !!ALLOWED_MIME[m], "Tipo de arquivo não permitido"),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES, "Arquivo maior que 500MB"),
});

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    rateLimit(req, "upload-ticket", 60, 60_000);
    const { mime, size } = schema.parse(req.body);
    try {
      return await createUploadTicket(mime, size);
    } catch (e) {
      if (e instanceof UploadTooLargeError) throw new HttpError(413, e.message);
      throw e;
    }
  },
});
