import { expect, test } from "bun:test";
import { Effect } from "effect";
import { fetchRoomPage } from "@stream-fetcher/huya/internal";

test("fetchRoomPage fetches and decodes the room page", async () => {
  let receivedReferer = "";
  let receivedUserAgent = "";

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      receivedReferer = request.headers.get("referer") ?? "";
      receivedUserAgent = request.headers.get("user-agent") ?? "";
      return new Response('<html><script>var TT_ROOM_DATA = {"state":"ON"};</script></html>', {
        headers: { "content-type": "text/html" },
      });
    },
  });

  const port = server.port;

  try {
    const page = await Effect.runPromise(
      fetchRoomPage({
        referer: "https://www.huya.com/testroom",
        roomId: "testroom",
        webBase: `http://localhost:${port}`,
      }),
    );

    expect(page).toContain('"state":"ON"');
    expect(receivedReferer).toBe("https://www.huya.com/testroom");
    expect(receivedUserAgent).toContain("Chrome");
  } finally {
    await server.stop();
  }
});

test("fetchRoomPage decodes HTML entities", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => {
      return new Response("<html>&quot;hello&amp;world&lt;</html>", {
        headers: { "content-type": "text/html" },
      });
    },
  });

  const port = server.port;

  try {
    const page = await Effect.runPromise(
      fetchRoomPage({
        referer: "https://www.huya.com/testroom",
        roomId: "testroom",
        webBase: `http://localhost:${port}`,
      }),
    );

    expect(page).toBe('<html>"hello&world<</html>');
  } finally {
    await server.stop();
  }
});

test("fetchRoomPage throws on non-OK response", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => {
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port;

  try {
    let thrown = false;
    try {
      await Effect.runPromise(
        fetchRoomPage({
          referer: "https://www.huya.com/testroom",
          roomId: "testroom",
          webBase: `http://localhost:${port}`,
        }),
      );
    } catch (err) {
      thrown = true;
      expect((err as Error).message).toBe("Huya room page request failed: 404");
    }
    expect(thrown).toBe(true);
  } finally {
    await server.stop();
  }
});
