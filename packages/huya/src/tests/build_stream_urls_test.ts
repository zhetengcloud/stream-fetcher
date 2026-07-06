import { assertEquals } from "@std/assert";
import {
  buildStreamUrls,
  type StreamInfo,
} from "@stream-fetcher/huya/internal";

const FM =
  "fm=QkctYzVidGlfMjQ2NzIyMDVfNzIyODJfMTY4MTgwMTYxMHgtNzQ5Mzk3NjI0LTEgMSAxIDEgMSAxIDEgMSAx&ctype=huya_live&fs=bgct&t=100&wsTime=66666666";

function makeStreamInfo(
  overrides: Partial<StreamInfo> = {},
): StreamInfo {
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

Deno.test("buildStreamUrls builds FLV URLs sorted by priority", () => {
  const urls = buildStreamUrls({
    streamsInfo: [
      makeStreamInfo({ sCdnType: "HW", iWebPriorityRate: 50 }),
      makeStreamInfo({ sCdnType: "TX", iWebPriorityRate: 100 }),
    ],
    isHls: false,
  });

  assertEquals(urls.length, 2);
  assertEquals(urls[0].cdn, "TX");
  assertEquals(urls[1].cdn, "HW");
  assertEquals(urls[0].url.includes(".flv"), true);
  assertEquals(urls[0].url.startsWith("https://flv.example.com/"), true);
});

Deno.test("buildStreamUrls builds HLS URLs when isHls is true", () => {
  const urls = buildStreamUrls({
    streamsInfo: [makeStreamInfo()],
    isHls: true,
  });

  assertEquals(urls.length, 1);
  assertEquals(urls[0].url.includes(".m3u8"), true);
  assertEquals(urls[0].url.startsWith("https://hls.example.com/"), true);
});

Deno.test("buildStreamUrls filters out reserved CDN prefixes", () => {
  const urls = buildStreamUrls({
    streamsInfo: [
      makeStreamInfo({ sCdnType: "HY" }),
      makeStreamInfo({ sCdnType: "HUYA" }),
      makeStreamInfo({ sCdnType: "HYZJ" }),
      makeStreamInfo({ sCdnType: "TX" }),
    ],
    isHls: false,
  });

  assertEquals(urls.length, 1);
  assertEquals(urls[0].cdn, "TX");
});

Deno.test("buildStreamUrls skips incomplete stream info", () => {
  const urls = buildStreamUrls({
    streamsInfo: [
      makeStreamInfo({ sFlvUrl: undefined }),
      makeStreamInfo(),
    ],
    isHls: false,
  });

  assertEquals(urls.length, 1);
  assertEquals(urls[0].cdn, "TX");
});

Deno.test("buildStreamUrls preserves anti-code query parameters", () => {
  const urls = buildStreamUrls({
    streamsInfo: [makeStreamInfo()],
    isHls: false,
  });

  assertEquals(urls[0].url.includes("wsSecret="), true);
  assertEquals(urls[0].url.includes("wsTime="), true);
  assertEquals(urls[0].url.includes("seqid="), true);
  assertEquals(urls[0].url.includes("codec=264"), true);
});
