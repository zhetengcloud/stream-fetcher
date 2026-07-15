import { expect, test } from "bun:test";
import { Effect } from "effect";
import { signRequest } from "@stream-fetcher/core/utils/s3_sign";

test("signRequest produces an Authorization header", async () => {
  const headers = await Effect.runPromise(
    signRequest({
      method: "PUT",
      url: new URL("https://test-bucket.s3.amazonaws.com/object/key.ts"),
      headers: { "content-type": "video/MP2T" },
      body: new TextEncoder().encode("payload"),
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      service: "s3",
    }),
  );

  const auth = headers.get("authorization");
  expect(auth).toStartWith("AWS4-HMAC-SHA256");
  expect(headers.has("x-amz-content-sha256")).toBe(true);
  expect(headers.has("x-amz-date")).toBe(true);
});
