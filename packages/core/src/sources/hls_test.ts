import { assertEquals } from "@std/assert";
import { Effect, Stream } from "effect";
import { HlsSource } from "@stream-fetcher/core";

function readAll(
  stream: Stream.Stream<Uint8Array, Error, never>,
): Effect.Effect<Uint8Array, Error, never> {
  return stream.pipe(
    Stream.runCollect,
    Effect.map((chunk) => {
      const chunks = Array.from(chunk);
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      return merged;
    }),
  );
}

Deno.test("HlsSource emits concatenated segment bytes for VOD playlist", async () => {
  const segments = ["hello", " ", "world"];
  const encoder = new TextEncoder();

  const server = Deno.serve({ port: 0 }, (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/playlist.m3u8") {
      const lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:5",
      ];
      for (let i = 0; i < segments.length; i++) {
        lines.push("#EXTINF:1.0,");
        lines.push(`/segment/${i}.ts`);
      }
      lines.push("#EXT-X-ENDLIST");
      return new Response(lines.join("\n"), {
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      });
    }
    if (url.pathname.startsWith("/segment/")) {
      const index = Number(url.pathname.split("/")[2].replace(/\.ts$/, ""));
      return new Response(encoder.encode(segments[index]), {
        headers: { "content-type": "video/mp2t" },
      });
    }
    return new Response("not found", { status: 404 });
  });

  const port = (server.addr as Deno.NetAddr).port;

  try {
    const source = new HlsSource();
    const stream = source.open({
      playlistUrl: `http://localhost:${port}/playlist.m3u8`,
    });
    const total = new TextDecoder().decode(
      await Effect.runPromise(readAll(stream)),
    );

    assertEquals(total, "hello world");
  } finally {
    await server.shutdown();
  }
});

Deno.test("HlsSource refreshes live playlist and fetches new segments", async () => {
  const encoder = new TextEncoder();
  const servedSegments: string[] = [];

  const server = Deno.serve({ port: 0 }, (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/live.m3u8") {
      const nextIndex = servedSegments.length;
      const lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:5",
        "#EXTINF:1.0,",
        `/segment/${nextIndex}.ts`,
      ];
      return new Response(lines.join("\n"), {
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      });
    }
    if (url.pathname.startsWith("/segment/")) {
      const index = Number(url.pathname.split("/")[2].replace(/\.ts$/, ""));
      const payload = `seg${index}`;
      servedSegments.push(payload);
      return new Response(encoder.encode(payload), {
        headers: { "content-type": "video/mp2t" },
      });
    }
    return new Response("not found", { status: 404 });
  });

  const port = (server.addr as Deno.NetAddr).port;

  try {
    const source = new HlsSource();
    const stream = source.open({
      playlistUrl: `http://localhost:${port}/live.m3u8`,
      refreshIntervalMs: 50,
      maxRefreshCount: 4,
    });
    const total = new TextDecoder().decode(
      await Effect.runPromise(readAll(stream)),
    );

    assertEquals(total, "seg0seg1seg2seg3seg4");
  } finally {
    await server.shutdown();
  }
});

Deno.test("HlsSource supports relative and absolute segment URLs", async () => {
  const encoder = new TextEncoder();

  const server = Deno.serve({ port: 0 }, (request: Request) => {
    const url = new URL(request.url);
    if (url.pathname === "/playlist.m3u8") {
      const port = (server.addr as Deno.NetAddr).port;
      const lines: string[] = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-TARGETDURATION:5",
        "#EXTINF:1.0,",
        "/absolute.ts",
        "#EXTINF:1.0,",
        `http://localhost:${port}/remote.ts`,
        "#EXT-X-ENDLIST",
      ];
      return new Response(lines.join("\n"), {
        headers: { "content-type": "application/vnd.apple.mpegurl" },
      });
    }
    if (url.pathname === "/absolute.ts") {
      return new Response(encoder.encode("absolute"), {
        headers: { "content-type": "video/mp2t" },
      });
    }
    if (url.pathname === "/remote.ts") {
      return new Response(encoder.encode("remote"), {
        headers: { "content-type": "video/mp2t" },
      });
    }
    return new Response("not found", { status: 404 });
  });

  const port = (server.addr as Deno.NetAddr).port;

  try {
    const source = new HlsSource();
    const stream = source.open({
      playlistUrl: `http://localhost:${port}/playlist.m3u8`,
    });
    const total = new TextDecoder().decode(
      await Effect.runPromise(readAll(stream)),
    );

    assertEquals(total, "absoluteremote");
  } finally {
    await server.shutdown();
  }
});
