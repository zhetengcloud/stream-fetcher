import { assertEquals } from "@std/assert";
import { signRequest } from "./s3_sign.ts";

Deno.test("signRequest produces an Authorization header", async () => {
  const headers = await signRequest({
    method: "PUT",
    url: new URL("https://test-bucket.s3.amazonaws.com/object/key.ts"),
    headers: { "content-type": "video/MP2T" },
    body: new TextEncoder().encode("payload"),
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    service: "s3",
  });

  const auth = headers.get("authorization");
  assertEquals(auth?.startsWith("AWS4-HMAC-SHA256"), true);
  assertEquals(headers.has("x-amz-content-sha256"), true);
  assertEquals(headers.has("x-amz-date"), true);
});
