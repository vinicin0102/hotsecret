import { z } from "zod";
import { apiHandler, requireAdmin } from "@/lib/api";
import { addTagToLead, removeTagFromLead } from "@/services/tags";

const schema = z.object({ tagId: z.string().max(64) });

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    await addTagToLead(String(req.query.id), schema.parse(req.body).tagId, "manual");
    return { ok: true };
  },
  DELETE: async (req) => {
    await requireAdmin(req);
    await removeTagFromLead(String(req.query.id), schema.parse(req.body).tagId);
    return { ok: true };
  },
});
