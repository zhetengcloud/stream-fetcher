import { expect, test } from "bun:test";
import { Effect } from "effect";
import { applyRatio, selectStreamUrl } from "@stream-fetcher/huya/internal";

test("selectStreamUrl picks highest priority CDN by default", async () => {
  const url = await Effect.runPromise(
    selectStreamUrl({
      streamUrls: [
        { cdn: "TX", url: "https://tx.example.com/stream" },
        { cdn: "HW", url: "https://hw.example.com/stream" },
      ],
    }),
  );

  expect(url).toBe("https://tx.example.com/stream");
});

test("selectStreamUrl prefers selected CDN", async () => {
  const url = await Effect.runPromise(
    selectStreamUrl({
      streamUrls: [
        { cdn: "TX", url: "https://tx.example.com/stream" },
        { cdn: "HW", url: "https://hw.example.com/stream" },
      ],
      preferredCdn: "HW",
    }),
  );

  expect(url).toBe("https://hw.example.com/stream");
});

test("selectStreamUrl throws when no URLs available", async () => {
  await expect(Effect.runPromise(selectStreamUrl({ streamUrls: [] }))).rejects.toThrow(
    "No usable Huya CDN stream URL found",
  );
});

test("applyRatio appends best matching ratio", () => {
  const url = applyRatio({
    url: "https://tx.example.com/stream.flv?wsSecret=abc",
    bitrateInfo: [{ iBitRate: 3000 }, { iBitRate: 5000 }],
    maxBitrate: 10000,
    maxRatio: 4000,
  });

  expect(url).toContain("ratio=3000");
});

test("applyRatio skips when maxRatio is zero", () => {
  const url = applyRatio({
    url: "https://tx.example.com/stream.flv",
    bitrateInfo: [{ iBitRate: 3000 }],
    maxBitrate: 10000,
    maxRatio: 0,
  });

  expect(url).toBe("https://tx.example.com/stream.flv");
});

test("applyRatio skips when url already has ratio", () => {
  const url = applyRatio({
    url: "https://tx.example.com/stream.flv?ratio=1000",
    bitrateInfo: [{ iBitRate: 3000 }],
    maxBitrate: 10000,
    maxRatio: 4000,
  });

  expect(url).toBe("https://tx.example.com/stream.flv?ratio=1000");
});

test("applyRatio falls back to maxBitrate when iBitRate is missing", () => {
  const url = applyRatio({
    url: "https://tx.example.com/stream.flv",
    bitrateInfo: [{ iBitRate: undefined as unknown as number }],
    maxBitrate: 8000,
    maxRatio: 9000,
  });

  expect(url).toContain("ratio=8000");
});
