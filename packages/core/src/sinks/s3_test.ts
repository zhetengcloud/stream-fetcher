import { assertEquals, assertExists } from "@std/assert";
import { S3Sink } from "@stream-fetcher/core/sinks/s3";

interface CapturedRequest {
  method: string;
  url: string;
  headers: Headers;
  body: Uint8Array;
}

function createMockS3Server(): {
  requests: CapturedRequest[];
  start(): Promise<{ url: URL; stop: () => Promise<void> }>;
} {
  const requests: CapturedRequest[] = [];

  return {
    requests,
    async start() {
      const server = Deno.serve({ port: 0 }, async (request) => {
        const body = new Uint8Array(await request.arrayBuffer());
        requests.push({
          method: request.method,
          url: request.url,
          headers: request.headers,
          body,
        });

        const url = new URL(request.url);

        if (url.searchParams.has("uploads")) {
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?><InitiateMultipartUploadResult><UploadId>test-upload-id</UploadId></InitiateMultipartUploadResult>`,
            { headers: { "Content-Type": "application/xml" } },
          );
        }

        if (url.searchParams.has("partNumber")) {
          return new Response(null, {
            status: 200,
            headers: { ETag: `"part-${url.searchParams.get("partNumber")}"` },
          });
        }

        if (url.searchParams.has("uploadId")) {
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUploadResult><Location>http://mock/object.ts</Location></CompleteMultipartUploadResult>`,
            { headers: { "Content-Type": "application/xml" } },
          );
        }

        return new Response("not found", { status: 404 });
      });

      const url = new URL(`http://localhost:${(server.addr as Deno.NetAddr).port}`);

      return {
        url,
        async stop() {
          await server.shutdown();
        },
      };
    },
  };
}

Deno.test("S3Sink performs multipart upload to a mock S3 server", async () => {
  const { requests, start } = createMockS3Server();
  const { url, stop } = await start();

  try {
    const sink = new S3Sink();
    const stream = await sink.open({
      endpoint: url,
      bucket: "test-bucket",
      key: "stream.ts",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      partSize: 10,
    });

    const writer = stream.getWriter();
    await writer.write(new TextEncoder().encode("0123456789"));
    await writer.write(new TextEncoder().encode("abcdefghij"));
    await writer.close();

    const initiate = requests.find((r) => r.url.includes("uploads="));
    assertExists(initiate);
    assertEquals(initiate.method, "POST");

    const parts = requests.filter((r) => r.url.includes("partNumber="));
    assertEquals(parts.length, 2);
    assertEquals(parts[0].headers.get("authorization")?.startsWith("AWS4-HMAC-SHA256"), true);

    const complete = requests.find((r) =>
      r.url.includes("uploadId=test-upload-id") && !r.url.includes("partNumber=")
    );
    assertExists(complete);
    assertEquals(complete.method, "POST");
  } finally {
    await stop();
  }
});
