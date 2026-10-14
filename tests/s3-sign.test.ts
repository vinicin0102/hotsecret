import { test } from "node:test";
import assert from "node:assert/strict";
import { presignUrl, uriEncode } from "../src/lib/s3-sign";

// exemplo oficial da documentação da AWS ("Authenticating Requests: Using Query Parameters")
test("presignUrl confere com o exemplo da AWS", () => {
  const url = presignUrl(
    { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1" },
    { method: "GET", url: "https://examplebucket.s3.amazonaws.com/test.txt", expiresSec: 86400, now: new Date("2013-05-24T00:00:00Z") },
  );
  assert.equal(new URL(url).searchParams.get("X-Amz-Signature"), "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  assert.equal(new URL(url).searchParams.get("X-Amz-SignedHeaders"), "host");
});

test("presignUrl assina cabeçalhos extras e codifica o caminho", () => {
  const url = presignUrl(
    { accessKeyId: "AK", secretAccessKey: "SK", region: "auto" },
    { method: "PUT", url: "https://acc.r2.cloudflarestorage.com/hot/uploads/a b.mp4", headers: { "Content-Type": "video/mp4", "Cache-Control": "public" } },
  );
  const u = new URL(url);
  assert.equal(u.pathname, "/hot/uploads/a%20b.mp4");
  assert.equal(u.searchParams.get("X-Amz-SignedHeaders"), "cache-control;content-type;host");
  assert.match(u.searchParams.get("X-Amz-Credential") ?? "", /^AK\/\d{8}\/auto\/s3\/aws4_request$/);
});

test("uriEncode: valor vazio continua vazio e / só fica no caminho", () => {
  assert.equal(uriEncode(""), "");
  assert.equal(uriEncode("a/b c"), "a%2Fb%20c");
  assert.equal(uriEncode("a/b c", true), "a/b%20c");
  const url = presignUrl({ accessKeyId: "AK", secretAccessKey: "SK", region: "auto" }, { method: "PUT", url: "https://x.test/hot", query: { cors: "" } });
  assert.match(url, /\?X-Amz-Algorithm=AWS4-HMAC-SHA256&.*&cors=&X-Amz-Signature=/);
});
