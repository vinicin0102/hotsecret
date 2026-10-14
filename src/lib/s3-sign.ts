// Assinatura AWS SigV4 (API S3) para o Cloudflare R2: URLs pré-assinadas para envio direto do navegador e
// chamadas do servidor (enviar, consultar e copiar arquivos). Sem SDK, só node:crypto.
import { createHash, createHmac } from "node:crypto";

export interface S3Creds {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const hmac = (key: Buffer | string, s: string) => createHmac("sha256", key).update(s).digest();

/** codificação de URI do SigV4 (RFC 3986; "/" mantida no caminho) */
export function uriEncode(s: string, keepSlash = false): string {
  const out = encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return keepSlash ? out.replace(/%2F/g, "/") : out;
}

const amzDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * URL pré-assinada (autenticação na query string). `headers` são assinados junto e precisam ser enviados
 * exatamente iguais por quem usar a URL (ex.: Content-Type e Cache-Control do upload).
 */
export function presignUrl(
  creds: S3Creds,
  opts: { method: string; url: string; expiresSec?: number; headers?: Record<string, string>; now?: Date; query?: Record<string, string> },
): string {
  const u = new URL(opts.url);
  const now = opts.now ?? new Date();
  const date = amzDate(now);
  const day = date.slice(0, 8);
  const scope = `${day}/${creds.region}/s3/aws4_request`;
  const headers: Record<string, string> = { host: u.host };
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v.trim();
  const signedHeaders = Object.keys(headers).sort().join(";");
  const query: Record<string, string> = {
    ...(opts.query ?? {}),
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${creds.accessKeyId}/${scope}`,
    "X-Amz-Date": date,
    "X-Amz-Expires": String(opts.expiresSec ?? 3600),
    "X-Amz-SignedHeaders": signedHeaders,
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join("");
  const path = uriEncode(decodeURIComponent(u.pathname), true);
  const canonical = [opts.method.toUpperCase(), path, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonical)].join("\n");
  const kDate = hmac(`AWS4${creds.secretAccessKey}`, day);
  const kSigning = hmac(hmac(hmac(kDate, creds.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  return `${u.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
