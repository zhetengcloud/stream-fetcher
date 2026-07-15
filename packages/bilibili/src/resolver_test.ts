import { expect, test } from "bun:test";
import { Effect } from "effect";
import { BilibiliProtocol, BilibiliResolver } from "@stream-fetcher/bilibili";

test("BilibiliResolver resolves a room URL into a Source", async () => {
  const resolver = new BilibiliResolver();

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/room/v1/Room/playUrl") {
        return Response.json({
          code: 0,
          data: {
            current_qn: 10000,
            quality_description: [{ qn: 10000, desc: "原画" }],
            durl: [{ url: "https://live.example.com/stream.flv" }],
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port;

  try {
    const resolved = await Effect.runPromise(
      resolver.resolve(`https://live.bilibili.com/12345`, {
        qn: 10000,
        protocol: BilibiliProtocol.Flv,
        _apiBase: `http://localhost:${port}`,
      }),
    );

    expect(resolved.source.name).toBe("bilibili");
    expect(resolved.source.open).toBeDefined();
    expect(resolved.metadata.platform).toBe("bilibili");
    expect(resolved.metadata.format).toBe(BilibiliProtocol.Flv);
    expect(resolved.metadata.roomId).toBe("12345");
    expect(resolved.metadata.playUrl).toBe("https://live.example.com/stream.flv");
  } finally {
    await server.stop();
  }
});

test("BilibiliResolver canHandle recognizes room URLs", () => {
  const resolver = new BilibiliResolver();
  expect(resolver.canHandle("https://live.bilibili.com/12345")).toBe(true);
  expect(resolver.canHandle("https://www.bilibili.com/12345")).toBe(true);
  expect(resolver.canHandle("https://youtube.com/12345")).toBe(false);
});
