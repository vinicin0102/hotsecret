import { apiHandler } from "@/lib/api";
import { clearAdminCookie } from "@/lib/auth";

export default apiHandler({
  POST: async (_req, res) => {
    res.setHeader("Set-Cookie", clearAdminCookie());
    return { ok: true };
  },
});
