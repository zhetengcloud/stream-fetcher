import { assertEquals, assertExists } from "@std/assert";
import { BilibiliProtocol, BilibiliResolver } from "@stream-fetcher/bilibili";

Deno.test("BilibiliResolver resolves a room URL into a Source", async () => {
  const resolver = new BilibiliResolver();

  const server = Deno.serve({ port: 0 }, (request) => {
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
  });

  const port = (server.addr as Deno.NetAddr).port;

  try {
    const source = await resolver.resolve(`https://live.bilibili.com/12345`, {
      qn: 10000,
      protocol: BilibiliProtocol.Flv,
      _apiBase: `http://localhost:${port}`,
    });

    assertEquals(source.name, "bilibili");
    assertExists(source.open);
  } finally {
    await server.shutdown();
  }
});

Deno.test("BilibiliResolver canHandle recognizes room URLs", () => {
  const resolver = new BilibiliResolver();
  assertEquals(resolver.canHandle("https://live.bilibili.com/12345"), true);
  assertEquals(resolver.canHandle("https://www.bilibili.com/12345"), true);
  assertEquals(resolver.canHandle("https://youtube.com/12345"), false);
});
