import { assertEquals, assertThrows } from "@std/assert";
import { applyRatio, selectStreamUrl } from "@stream-fetcher/huya/internal";

Deno.test("selectStreamUrl picks highest priority CDN by default", () => {
  const url = selectStreamUrl({
    streamUrls: [
      { cdn: "TX", url: "https://tx.example.com/stream" },
      { cdn: "HW", url: "https://hw.example.com/stream" },
    ],
  });

  assertEquals(url, "https://tx.example.com/stream");
});

Deno.test("selectStreamUrl prefers selected CDN", () => {
  const url = selectStreamUrl({
    streamUrls: [
      { cdn: "TX", url: "https://tx.example.com/stream" },
      { cdn: "HW", url: "https://hw.example.com/stream" },
    ],
    preferredCdn: "HW",
  });

  assertEquals(url, "https://hw.example.com/stream");
});

Deno.test("selectStreamUrl throws when no URLs available", () => {
  assertThrows(
    () => selectStreamUrl({ streamUrls: [] }),
    Error,
    "No usable Huya CDN stream URL found",
  );
});

Deno.test("applyRatio appends best matching ratio", () => {
  const url = applyRatio({
    url: "https://tx.example.com/stream.flv?wsSecret=abc",
    bitrateInfo: [{ iBitRate: 3000 }, { iBitRate: 5000 }],
    maxBitrate: 10000,
    maxRatio: 4000,
  });

  assertEquals(url.includes("ratio=3000"), true);
});

Deno.test("applyRatio skips when maxRatio is zero", () => {
  const url = applyRatio({
    url: "https://tx.example.com/stream.flv",
    bitrateInfo: [{ iBitRate: 3000 }],
    maxBitrate: 10000,
    maxRatio: 0,
  });

  assertEquals(url, "https://tx.example.com/stream.flv");
});

Deno.test("applyRatio skips when url already has ratio", () => {
  const url = applyRatio({
    url: "https://tx.example.com/stream.flv?ratio=1000",
    bitrateInfo: [{ iBitRate: 3000 }],
    maxBitrate: 10000,
    maxRatio: 4000,
  });

  assertEquals(url, "https://tx.example.com/stream.flv?ratio=1000");
});

Deno.test("applyRatio falls back to maxBitrate when iBitRate is missing", () => {
  const url = applyRatio({
    url: "https://tx.example.com/stream.flv",
    bitrateInfo: [{ iBitRate: undefined as unknown as number }],
    maxBitrate: 8000,
    maxRatio: 9000,
  });

  assertEquals(url.includes("ratio=8000"), true);
});
