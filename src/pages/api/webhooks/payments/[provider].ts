// Webhook do gateway: corpo bruto preservado para validação de assinatura.
import type { NextApiRequest, NextApiResponse } from "next";
import { checkRateLimit } from "@/lib/rate-limit";
import { handlePaymentWebhook } from "@/services/payments/webhooks";

export const config = { api: { bodyParser: false } };

async function readRawBody(req: NextApiRequest, limit = 256 * 1024): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("payload too large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0];
  if (!checkRateLimit(`webhook:${ip}`, 600, 60_000).ok) return res.status(429).end();
  try {
    const rawBody = await readRawBody(req);
    const provider = String(req.query.provider ?? "");
    const out = await handlePaymentWebhook(provider, { headers: req.headers, query: req.query, rawBody });
    return res.status(out.status).json(out.body);
  } catch (err) {
    console.error("[webhook]", err);
    return res.status(500).json({ error: "erro" });
  }
}
