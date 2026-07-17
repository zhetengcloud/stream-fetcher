import { expect, test } from "bun:test";
import { Effect } from "effect";
import { WbiSigner, type WbiKeyCache } from "./wbi.ts";

const IMG_URL = "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b8402c7.png";
const SUB_URL = "https://i0.hdslb.com/bfs/wbi/4932caff0f74690f22ce692c3150de77.png";

test("WbiSigner derives the mixin key from nav response", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/x/web-interface/nav") {
        return Response.json({
          data: {
            wbi_img: { img_url: IMG_URL, sub_url: SUB_URL },
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  try {
    const signer = new WbiSigner(`http://localhost:${server.port}`);
    const signed = await Effect.runPromise(signer.sign(new Map([["room_id", "12345"]]), {}));

    expect(signed.has("wts")).toBe(true);
    expect(signed.has("w_rid")).toBe(true);
    expect(signed.get("w_rid")?.length).toBe(32);
  } finally {
    await server.stop();
  }
});

test("WbiSigner caches the mixin key for subsequent signs", async () => {
  let navCalls = 0;
  const server = Bun.serve({
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/x/web-interface/nav") {
        navCalls++;
        return Response.json({
          data: {
            wbi_img: { img_url: IMG_URL, sub_url: SUB_URL },
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });

  try {
    const signer = new WbiSigner(`http://localhost:${server.port}`);
    await Effect.runPromise(signer.sign(new Map([["a", "1"]]), {}));
    await Effect.runPromise(signer.sign(new Map([["b", "2"]]), {}));

    expect(navCalls).toBe(1);
  } finally {
    await server.stop();
  }
});

test("WbiSigner fails when nav response is missing WBI keys", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => Response.json({ data: {} }),
  });

  try {
    const signer = new WbiSigner(`http://localhost:${server.port}`);
    const result = await Effect.runPromise(Effect.either(signer.sign(new Map([["a", "1"]]), {})));

    expect(result._tag).toBe("Left");
  } finally {
    await server.stop();
  }
});

test("WbiSigner uses an injected cache", async () => {
  let setCalls = 0;
  let getCalls = 0;

  const customCache: WbiKeyCache = {
    get: () => {
      getCalls++;
      return Effect.succeed(undefined);
    },
    set: () => {
      setCalls++;
      return Effect.void;
    },
  };

  const server = Bun.serve({
    port: 0,
    fetch: () =>
      Response.json({
        data: {
          wbi_img: { img_url: IMG_URL, sub_url: SUB_URL },
        },
      }),
  });

  try {
    const signer = new WbiSigner(`http://localhost:${server.port}`, customCache);
    await Effect.runPromise(signer.sign(new Map([["a", "1"]]), {}));

    expect(getCalls).toBe(1);
    expect(setCalls).toBe(1);
  } finally {
    await server.stop();
  }
});
