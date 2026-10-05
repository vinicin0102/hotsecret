import { apiHandler, rateLimit, requireAdmin } from "@/lib/api";
import { testAiConnection } from "@/services/ai/brain";

export const config = { maxDuration: 60 };

export default apiHandler({
  POST: async (req) => {
    await requireAdmin(req);
    rateLimit(req, "ai-test", 10, 60_000);
    return testAiConnection();
  },
});
