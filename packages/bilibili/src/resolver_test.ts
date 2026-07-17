import { expect, test } from "bun:test";
import { Effect } from "effect";
import { BilibiliProtocol, BilibiliResolver } from "@stream-fetcher/bilibili";

const PLAY_URL_PATH = "/room/v1/Room/playUrl";
const ROOM_PLAY_INFO_PATH = "/xlive/web-room/v2/index/getRoomPlayInfo";
const NAV_PATH = "/x/web-interface/nav";

function playUrlResponse(): object {
  return {
    code: 0,
    data: {
      current_qn: 10000,
      quality_description: [{ qn: 10000, desc: "原画" }],
      durl: [{ url: "https://live.example.com/stream.flv" }],
    },
  };
}

function roomPlayInfoResponse(): object {
  return {
    code: 0,
    data: {
      title: "Test Room",
      playurl_info: {
        playurl: {
          stream: [
            {
              protocol_name: "http_stream",
              format: [
                {
                  format_name: "flv",
                  codec: [
                    {
                      base_url: "/live/example/stream.flv",
                      current_qn: 10000,
                      url_info: [{ host: "https://live.example.com", extra: "?expires=123" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  };
}

function navResponse(): object {
  return {
    data: {
      wbi_img: {
        img_url: "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b8402c7.png",
        sub_url: "https://i0.hdslb.com/bfs/wbi/4932caff0f74690f22ce692c3150de77.png",
      },
    },
  };
}

test("BilibiliResolver resolves a room URL into a Source", async () => {
  const resolver = new BilibiliResolver();

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === PLAY_URL_PATH) {
        return Response.json(playUrlResponse());
      }
      return new Response("not found", { status: 404 });
    },
  });

  try {
    const resolved = await Effect.runPromise(
      resolver.resolve(`https://live.bilibili.com/12345`, {
        qn: 10000,
        protocol: BilibiliProtocol.Flv,
        _apiBase: `http://localhost:${server.port}`,
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

test("BilibiliResolver sends cookie string in request headers", async () => {
  const resolver = new BilibiliResolver();
  let receivedCookie: string | null = null;

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === PLAY_URL_PATH) {
        receivedCookie = request.headers.get("cookie");
        return Response.json(playUrlResponse());
      }
      return new Response("not found", { status: 404 });
    },
  });

  try {
    await Effect.runPromise(
      resolver.resolve(`https://live.bilibili.com/12345`, {
        cookie: "SESSDATA=abc; bili_jct=xyz",
        _apiBase: `http://localhost:${server.port}`,
      }),
    );

    expect(receivedCookie).toBe("SESSDATA=abc; bili_jct=xyz");
  } finally {
    await server.stop();
  }
});

test("BilibiliResolver loads cookies from a biliup cookie file", async () => {
  const resolver = new BilibiliResolver();
  let receivedCookie: string | null = null;

  const cookieFile = `${import.meta.dir}/tmp_bilibili_cookie.json`;
  await Bun.write(
    cookieFile,
    JSON.stringify({
      cookie_info: {
        cookies: [
          { name: "SESSDATA", value: "abc" },
          { name: "bili_jct", value: "xyz" },
        ],
      },
    }),
  );

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === PLAY_URL_PATH) {
        receivedCookie = request.headers.get("cookie");
        return Response.json(playUrlResponse());
      }
      return new Response("not found", { status: 404 });
    },
  });

  try {
    await Effect.runPromise(
      resolver.resolve(`https://live.bilibili.com/12345`, {
        cookieFile,
        _apiBase: `http://localhost:${server.port}`,
      }),
    );

    expect(receivedCookie).toBe("SESSDATA=abc;bili_jct=xyz");
  } finally {
    await server.stop();
    await Bun.file(cookieFile).delete();
  }
});

test("BilibiliResolver uses WBI-signed endpoint when useWbi is true", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === NAV_PATH) {
        return Response.json(navResponse());
      }
      if (url.pathname === ROOM_PLAY_INFO_PATH) {
        expect(url.searchParams.has("wts")).toBe(true);
        expect(url.searchParams.has("w_rid")).toBe(true);
        expect(url.searchParams.get("room_id")).toBe("12345");
        return Response.json(roomPlayInfoResponse());
      }
      return new Response("not found", { status: 404 });
    },
  });

  try {
    const resolver = new BilibiliResolver({ _webInterfaceBase: `http://localhost:${server.port}` });
    const resolved = await Effect.runPromise(
      resolver.resolve(`https://live.bilibili.com/12345`, {
        useWbi: true,
        _apiBase: `http://localhost:${server.port}`,
      }),
    );

    expect(resolved.metadata.playUrl).toBe(
      "https://live.example.com/live/example/stream.flv?expires=123",
    );
    expect(resolved.metadata.title).toBe("Test Room");
  } finally {
    await server.stop();
  }
});
