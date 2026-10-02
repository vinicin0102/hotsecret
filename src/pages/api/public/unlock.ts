// Libera o conteúdo pago do fluxo para quem tem pagamento APROVADO (confirmado pelo gateway).
import { z } from "zod";
import { apiHandler, rateLimit } from "@/lib/api";
import { requireLeadSession } from "@/services/conversation";
import { entitledNodes } from "@/services/funnels";

const schema = z.object({ token: z.string().min(10).max(2000) });

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "unlock", 60, 60_000);
    const { token } = schema.parse(req.body);
    const session = await requireLeadSession(token);
    const { graph, unlocked } = await entitledNodes(session.funnelId, session.leadId);
    return { nodes: graph.nodes.filter((n) => unlocked.has(n.id)) };
  },
});
