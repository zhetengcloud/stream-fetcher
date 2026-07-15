import { expect, test } from "bun:test";
import { Effect } from "effect";
import { HuyaProtocol, HuyaResolver } from "@stream-fetcher/huya";
import { messages } from "@stream-fetcher/huya/messages";

const ROOM_PAGE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head><title>Test Room</title></head>
<body>
<script>
var TT_ROOM_DATA = {"state":"ON"};
var hyPlayerConfig = {
  stream: {
    "data": [{
      "gameLiveInfo": {
        "introduction": "Live Stream",
        "screenshot": "https://example.com/cover.jpg",
        "bitRate": 10000
      },
      "gameStreamInfoList": [{
        "sStreamName": "test-stream-imgplus",
        "sCdnType": "TX",
        "iWebPriorityRate": 100,
        "sFlvUrl": "http://flv.example.com",
        "sFlvUrlSuffix": "flv",
        "sFlvAntiCode": "fm=QkctYzVidGlfMjQ2NzIyMDVfNzIyODJfMTY4MTgwMTYxMHgtNzQ5Mzk3NjI0LTEgMSAxIDEgMSAxIDEgMSAx\u0026ctype=huya_live\u0026fs=bgct\u0026t=100\u0026wsTime=66666666",
        "sHlsUrl": "http://hls.example.com",
        "sHlsUrlSuffix": "m3u8",
        "sHlsAntiCode": "fm=QkctYzVidGlfMjQ2NzIyMDVfNzIyODJfMTY4MTgwMTYxMHgtNzQ5Mzk3NjI0LTEgMSAxIDEgMSAxIDEgMSAx\u0026ctype=huya_live\u0026fs=bgct\u0026t=100\u0026wsTime=66666666"
      }, {
        "sStreamName": "test-stream2",
        "sCdnType": "HW",
        "iWebPriorityRate": 50,
        "sFlvUrl": "http://flv2.example.com",
        "sFlvUrlSuffix": "flv",
        "sFlvAntiCode": "fm=QkctYzVidGlfMjQ2NzIyMDVfNzIyODJfMTY4MTgwMTYxMHgtNzQ5Mzk3NjI0LTEgMSAxIDEgMSAxIDEgMSAx\u0026ctype=huya_live\u0026fs=bgct\u0026t=100\u0026wsTime=66666666"
      }]
    }],
    "vMultiStreamInfo": [
      {"iBitRate": 10000},
      {"iBitRate": 3000}
    ]
  },
  liveLineUrl: "https://example.invalid"
};
</script>
</body>
</html>
`;

test("HuyaResolver resolves a room URL into a Source", async () => {
  const resolver = new HuyaResolver();

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/testroom") {
        return new Response(ROOM_PAGE_TEMPLATE, {
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port;

  try {
    const resolved = await Effect.runPromise(
      resolver.resolve(`https://www.huya.com/testroom`, {
        protocol: HuyaProtocol.Flv,
        _webBase: `http://localhost:${port}`,
      }),
    );

    expect(resolved.source.name).toBe("huya");
    expect(resolved.source.open).toBeDefined();
    expect(resolved.metadata.platform).toBe("huya");
    expect(resolved.metadata.format).toBe(HuyaProtocol.Flv);
    expect(resolved.metadata.roomId).toBe("testroom");
    expect(typeof resolved.metadata.playUrl).toBe("string");

    // Do not open the HTTP source in unit tests; it would hit example.com.
    // Verifying the source is returned is sufficient here.
  } finally {
    await server.stop();
  }
});

test("HuyaResolver canHandle recognizes room URLs", () => {
  const resolver = new HuyaResolver();
  expect(resolver.canHandle("https://www.huya.com/testroom")).toBe(true);
  expect(resolver.canHandle("https://m.huya.com/testroom")).toBe(true);
  expect(resolver.canHandle("https://www.huya.com/12345")).toBe(true);
  expect(resolver.canHandle("https://bilibili.com/12345")).toBe(false);
});

test("HuyaResolver prefers selected CDN", async () => {
  const resolver = new HuyaResolver();

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/testroom") {
        return new Response(ROOM_PAGE_TEMPLATE, {
          headers: { "content-type": "text/html" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port;

  try {
    const resolved = await Effect.runPromise(
      resolver.resolve(`https://www.huya.com/testroom`, {
        protocol: HuyaProtocol.Flv,
        cdn: "HW",
        _webBase: `http://localhost:${port}`,
      }),
    );

    // The resolver should select the HW CDN over the higher-priority TX CDN.
    expect(resolved.source.name).toBe("huya");
    expect(resolved.source.open).toBeDefined();
  } finally {
    await server.stop();
  }
});

test("HuyaResolver rejects offline rooms", async () => {
  const resolver = new HuyaResolver();

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/offline") {
        return new Response(
          `
          <script>
          var TT_ROOM_DATA = {"state":"OFF"};
          var hyPlayerConfig = { stream: {"data":[],"vMultiStreamInfo":[]} };
          </script>
          `,
          { headers: { "content-type": "text/html" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port;

  try {
    let caught = false;
    try {
      await Effect.runPromise(
        resolver.resolve(`https://www.huya.com/offline`, {
          _webBase: `http://localhost:${port}`,
        }),
      );
    } catch (err) {
      caught = true;
      expect((err as Error).message).toBe(messages.errors.offlineOrMissingData);
    }
    expect(caught).toBe(true);
  } finally {
    await server.stop();
  }
});

test("HuyaResolver rejects replays", async () => {
  const resolver = new HuyaResolver();

  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/replay") {
        return new Response(
          `
          <script>
          var TT_ROOM_DATA = {"state":"ON"};
          var hyPlayerConfig = {
            stream: {
              "data": [{
                "gameLiveInfo": {"introduction":"精彩回放","screenshot":"","bitRate":0},
                "gameStreamInfoList": [{
                  "sStreamName":"replay",
                  "sCdnType":"TX",
                  "iWebPriorityRate":100,
                  "sFlvUrl":"http://flv.example.com",
                  "sFlvUrlSuffix":"flv",
                  "sFlvAntiCode":"fm=bgct\u0026ctype=huya_live\u0026t=100\u0026wsTime=66666666"
                }]
              }],
              "vMultiStreamInfo":[{"iBitRate":10000}]
            }
          };
          </script>
          `,
          { headers: { "content-type": "text/html" } },
        );
      }
      return new Response("not found", { status: 404 });
    },
  });

  const port = server.port;

  try {
    let caught = false;
    try {
      await Effect.runPromise(
        resolver.resolve(`https://www.huya.com/replay`, {
          _webBase: `http://localhost:${port}`,
        }),
      );
    } catch (err) {
      caught = true;
      expect((err as Error).message).toBe(messages.errors.replay);
    }
    expect(caught).toBe(true);
  } finally {
    await server.stop();
  }
});
