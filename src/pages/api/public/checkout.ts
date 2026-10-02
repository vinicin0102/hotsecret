import { apiHandler, rateLimit } from "@/lib/api";
import { checkoutSchema } from "@/lib/validation";
import { requireLeadSession } from "@/services/conversation";
import { createCheckout, publicPayment } from "@/services/payments/service";

export default apiHandler({
  POST: async (req) => {
    rateLimit(req, "checkout", 10, 60_000);
    const body = checkoutSchema.parse(req.body);
    const session = await requireLeadSession(body.token);
    const payment = await createCheckout(session, body);
    return { payment: publicPayment(payment) };
  },
});
