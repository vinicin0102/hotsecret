import { apiHandler, requireAdmin } from "@/lib/api";
import { graphSchema } from "@/lib/validation";
import { saveGraph } from "@/services/funnels";
import { validateGraph } from "@/features/chat-engine/engine";

export default apiHandler({
  PUT: async (req) => {
    await requireAdmin(req);
    const graph = graphSchema.parse(req.body);
    await saveGraph(String(req.query.id), graph);
    return { ok: true, issues: validateGraph(graph) };
  },
});
