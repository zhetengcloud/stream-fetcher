import { expect, test } from "bun:test";
import { Effect } from "effect";
import { buildStreamUrls, type StreamInfo } from "@stream-fetcher/huya/internal";

const FM =
  "fm=QkctYzVidGlfMjQ2NzIyMDVfNzIyODJfMTY4MTgwMTYxMHgtNzQ5Mzk3NjI0LTEgMSAxIDEgMSAxIDEgMSAx\u0026ctype=huya_live\u0026fs=bgct\u0026t=100\u0026wsTime=66666666";

function makeStreamInfo(overrides: Partial<StreamInfo> = {}): StreamInfo {
  return {
    sStreamName: "test-stream",
    sCdnType: "TX",
    iWebPriorityRate: 100,
    sFlvUrl: "http://flv.example.com",
    sFlvUrlSuffix: "flv",
    sFlvAntiCode: FM,
    sHlsUrl: "http://hls.example.com",
    sHlsUrlSuffix: "m3u8",
    sHlsAntiCode: FM,
    ...overrides,
  };
}

test("buildStreamUrls builds FLV URLs sorted by priority", async () => {
  const urls = await Effect.runPromise(
    buildStreamUrls({
      streamsInfo: [
        makeStreamInfo({ sCdnType: "HW", iWebPriorityRate: 50 }),
        makeStreamInfo({ sCdnType: "TX", iWebPriorityRate: 100 }),
      ],
      isHls: false,
    }),
  );

  expect(urls.length).toBe(2);
  expect(urls[0].cdn).toBe("TX");
  expect(urls[1].cdn).toBe("HW");
  expect(urls[0].url).toContain(".flv");
  expect(urls[0].url).toStartWith("https://flv.example.com/");
});

test("buildStreamUrls builds HLS URLs when isHls is true", async () => {
  const urls = await Effect.runPromise(
    buildStreamUrls({
      streamsInfo: [makeStreamInfo()],
      isHls: true,
    }),
  );

  expect(urls.length).toBe(1);
  expect(urls[0].url).toContain(".m3u8");
  expect(urls[0].url).toStartWith("https://hls.example.com/");
});

test("buildStreamUrls filters out reserved CDN prefixes", async () => {
  const urls = await Effect.runPromise(
    buildStreamUrls({
      streamsInfo: [
        makeStreamInfo({ sCdnType: "HY" }),
        makeStreamInfo({ sCdnType: "HUYA" }),
        makeStreamInfo({ sCdnType: "HYZJ" }),
        makeStreamInfo({ sCdnType: "TX" }),
      ],
      isHls: false,
    }),
  );

  expect(urls.length).toBe(1);
  expect(urls[0].cdn).toBe("TX");
});

test("buildStreamUrls skips incomplete stream info", async () => {
  const urls = await Effect.runPromise(
    buildStreamUrls({
      streamsInfo: [makeStreamInfo({ sFlvUrl: undefined }), makeStreamInfo()],
      isHls: false,
    }),
  );

  expect(urls.length).toBe(1);
  expect(urls[0].cdn).toBe("TX");
});

test("buildStreamUrls preserves anti-code query parameters", async () => {
  const urls = await Effect.runPromise(
    buildStreamUrls({
      streamsInfo: [makeStreamInfo()],
      isHls: false,
    }),
  );

  expect(urls[0].url).toContain("wsSecret=");
  expect(urls[0].url).toContain("wsTime=");
  expect(urls[0].url).toContain("seqid=");
  expect(urls[0].url).toContain("codec=264");
});
