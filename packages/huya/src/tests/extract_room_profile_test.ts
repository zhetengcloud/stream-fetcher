import { expect, test } from "bun:test";
import { Effect } from "effect";
import { extractRoomProfile, findJsonValueEnd } from "@stream-fetcher/huya/internal";

function makePage(
  options: {
    state?: string;
    data?: string;
    gameLiveInfo?: string;
    gameStreamInfoList?: string;
    vMultiStreamInfo?: string;
    screenshot?: string;
  } = {},
): string {
  const state = options.state ?? "ON";
  const data =
    options.data ??
    `[{
      "gameLiveInfo": ${
        options.gameLiveInfo ??
        '{"introduction":"Live Stream","screenshot":"https://example.com/cover.jpg","bitRate":10000}'
      },
      "gameStreamInfoList": ${
        options.gameStreamInfoList ??
        '[{"sStreamName":"test-stream","sCdnType":"TX","iWebPriorityRate":100}]'
      }
    }]`;
  const vMultiStreamInfo = options.vMultiStreamInfo ?? '[{"iBitRate":10000}]';

  return `
<!DOCTYPE html>
<html>
<head><title>Test Room</title></head>
<body>
<script>
var TT_ROOM_DATA = {"state":"${state}"};
var hyPlayerConfig = {
  stream: {
    "data": ${data},
    "vMultiStreamInfo": ${vMultiStreamInfo}
  }
};
</script>
</body>
</html>
`;
}

test("extractRoomProfile parses live room page", async () => {
  const profile = await Effect.runPromise(extractRoomProfile(makePage()));
  expect(profile?.title).toBe("Live Stream");
  expect(profile?.cover).toBe("https://example.com/cover.jpg");
  expect(profile?.maxBitrate).toBe(10000);
  expect(profile?.bitrateInfo).toEqual([{ iBitRate: 10000 }]);
  expect(profile?.streamInfo.length).toBe(1);
  expect(profile?.streamInfo[0].sCdnType).toBe("TX");
});

test("extractRoomProfile returns null for offline room", async () => {
  expect(await Effect.runPromise(extractRoomProfile(makePage({ state: "OFF" })))).toBeNull();
});

test("extractRoomProfile returns null when no bitrate info", async () => {
  expect(
    await Effect.runPromise(extractRoomProfile(makePage({ vMultiStreamInfo: "[]" }))),
  ).toBeNull();
});

test("extractRoomProfile returns null when no stream info", async () => {
  expect(
    await Effect.runPromise(extractRoomProfile(makePage({ gameStreamInfoList: "[]" }))),
  ).toBeNull();
});

test("extractRoomProfile throws when room data is missing", async () => {
  const page = makePage().replace("var TT_ROOM_DATA", "var OTHER_DATA");
  await expect(Effect.runPromise(extractRoomProfile(page))).rejects.toThrow(
    "Huya room data not found",
  );
});

test("extractRoomProfile throws when stream data is missing", async () => {
  const page = makePage().replace(/stream:\s*\{/, "other: {");
  await expect(Effect.runPromise(extractRoomProfile(page))).rejects.toThrow(
    "Huya stream data not found",
  );
});

test("extractRoomProfile throws when stream data array is empty", async () => {
  await expect(Effect.runPromise(extractRoomProfile(makePage({ data: "[]" })))).rejects.toThrow(
    "Huya stream data is empty",
  );
});

test("extractRoomProfile throws when gameLiveInfo is missing", async () => {
  await expect(
    Effect.runPromise(extractRoomProfile(makePage({ gameLiveInfo: "null" }))),
  ).rejects.toThrow("Huya live info is empty");
});

test("extractRoomProfile upgrades http cover to https", async () => {
  const profile = await Effect.runPromise(
    extractRoomProfile(makePage({ screenshot: "http://example.com/cover.jpg" })),
  );
  expect(profile?.cover).toBe("https://example.com/cover.jpg");
});

test("extractRoomProfile handles escaped JSON strings", async () => {
  const profile = await Effect.runPromise(
    extractRoomProfile(
      makePage({
        gameLiveInfo: '{"introduction":"\\u56de\\u653e","screenshot":"","bitRate":0}',
      }),
    ),
  );
  expect(profile?.title).toBe("回放");
});

test("findJsonValueEnd locates a simple object", () => {
  expect(findJsonValueEnd('{"a":1}', 0)).toBe(7);
});

test("findJsonValueEnd locates an array", () => {
  expect(findJsonValueEnd("[1,2,3]", 0)).toBe(7);
});

test("findJsonValueEnd skips leading whitespace", () => {
  expect(findJsonValueEnd('   {"a":1}', 0)).toBe(10);
});

test("findJsonValueEnd respects the start offset", () => {
  expect(findJsonValueEnd('prefix {"a":1} suffix', 7)).toBe(14);
});

test("findJsonValueEnd handles nested objects and arrays", () => {
  expect(findJsonValueEnd('{"a":{"b":[1,2]},"c":"d"}', 0)).toBe(25);
});

test("findJsonValueEnd ignores braces inside strings", () => {
  expect(findJsonValueEnd('{"a":"{}"}', 0)).toBe(10);
});

test("findJsonValueEnd ignores escaped quotes inside strings", () => {
  expect(findJsonValueEnd('{"a":"\\""}', 0)).toBe(10);
});

test("findJsonValueEnd returns -1 for a non-JSON start", () => {
  expect(findJsonValueEnd("not json", 0)).toBe(-1);
});

test("findJsonValueEnd returns -1 for an incomplete value", () => {
  expect(findJsonValueEnd('{"a":1', 0)).toBe(-1);
});
