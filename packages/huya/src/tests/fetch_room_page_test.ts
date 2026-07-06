import { assertEquals } from "@std/assert";
import { Effect } from "effect";
import { fetchRoomPage } from "@stream-fetcher/huya/internal";

Deno.test("fetchRoomPage fetches and decodes the room page", async () => {
  let receivedReferer = "";
  let receivedUserAgent = "";

  const server = Deno.serve({ port: 0 }, (request) => {
    receivedReferer = request.headers.get("referer") ?? "";
    receivedUserAgent = request.headers.get("user-agent") ?? "";
    return new Response(
      '<html><script>var TT_ROOM_DATA = {"state":"ON"};</script></html>',
      { headers: { "content-type": "text/html" } },
    );
  });

  const port = (server.addr as Deno.NetAddr).port;

  try {
    const page = await Effect.runPromise(fetchRoomPage({
      referer: "https://www.huya.com/testroom",
      roomId: "testroom",
      webBase: `http://localhost:${port}`,
    }));

    assertEquals(page.includes('"state":"ON"'), true);
    assertEquals(receivedReferer, "https://www.huya.com/testroom");
    assertEquals(receivedUserAgent.includes("Chrome"), true);
  } finally {
    await server.shutdown();
  }
});

Deno.test("fetchRoomPage decodes HTML entities", async () => {
  const server = Deno.serve({ port: 0 }, () => {
    return new Response(
      "<html>&quot;hello&amp;world&lt;</html>",
      { headers: { "content-type": "text/html" } },
    );
  });

  const port = (server.addr as Deno.NetAddr).port;

  try {
    const page = await Effect.runPromise(fetchRoomPage({
      referer: "https://www.huya.com/testroom",
      roomId: "testroom",
      webBase: `http://localhost:${port}`,
    }));

    assertEquals(page, '<html>"hello&world<</html>');
  } finally {
    await server.shutdown();
  }
});

Deno.test("fetchRoomPage throws on non-OK response", async () => {
  const server = Deno.serve({ port: 0 }, () => {
    return new Response("not found", { status: 404 });
  });

  const port = (server.addr as Deno.NetAddr).port;

  try {
    let thrown = false;
    try {
      await Effect.runPromise(fetchRoomPage({
        referer: "https://www.huya.com/testroom",
        roomId: "testroom",
        webBase: `http://localhost:${port}`,
      }));
    } catch (err) {
      thrown = true;
      assertEquals(
        (err as Error).message,
        "Huya room page request failed: 404",
      );
    }
    assertEquals(thrown, true);
  } finally {
    await server.shutdown();
  }
});
