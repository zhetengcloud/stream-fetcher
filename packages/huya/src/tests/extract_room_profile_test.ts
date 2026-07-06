import { assertEquals, assertRejects } from "@std/assert";
import { Effect } from "effect";
import { extractRoomProfile } from "@stream-fetcher/huya/internal";

function makePage(options: {
  state?: string;
  data?: string;
  gameLiveInfo?: string;
  gameStreamInfoList?: string;
  vMultiStreamInfo?: string;
  screenshot?: string;
} = {}): string {
  const state = options.state ?? "ON";
  const data = options.data ??
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

Deno.test("extractRoomProfile parses live room page", async () => {
  const profile = await Effect.runPromise(extractRoomProfile(makePage()));
  assertEquals(profile?.title, "Live Stream");
  assertEquals(profile?.cover, "https://example.com/cover.jpg");
  assertEquals(profile?.maxBitrate, 10000);
  assertEquals(profile?.bitrateInfo, [{ iBitRate: 10000 }]);
  assertEquals(profile?.streamInfo.length, 1);
  assertEquals(profile?.streamInfo[0].sCdnType, "TX");
});

Deno.test("extractRoomProfile returns null for offline room", async () => {
  assertEquals(
    await Effect.runPromise(extractRoomProfile(makePage({ state: "OFF" }))),
    null,
  );
});

Deno.test("extractRoomProfile returns null when no bitrate info", async () => {
  assertEquals(
    await Effect.runPromise(
      extractRoomProfile(makePage({ vMultiStreamInfo: "[]" })),
    ),
    null,
  );
});

Deno.test("extractRoomProfile returns null when no stream info", async () => {
  assertEquals(
    await Effect.runPromise(
      extractRoomProfile(makePage({ gameStreamInfoList: "[]" })),
    ),
    null,
  );
});

Deno.test("extractRoomProfile throws when room data is missing", async () => {
  const page = makePage().replace("var TT_ROOM_DATA", "var OTHER_DATA");
  await assertRejects(
    () => Effect.runPromise(extractRoomProfile(page)),
    Error,
    "Huya room data not found",
  );
});

Deno.test("extractRoomProfile throws when stream data is missing", async () => {
  const page = makePage()
    .replace(/stream:\s*\{/, "other: {");
  await assertRejects(
    () => Effect.runPromise(extractRoomProfile(page)),
    Error,
    "Huya stream data not found",
  );
});

Deno.test("extractRoomProfile throws when stream data array is empty", async () => {
  await assertRejects(
    () => Effect.runPromise(extractRoomProfile(makePage({ data: "[]" }))),
    Error,
    "Huya stream data is empty",
  );
});

Deno.test("extractRoomProfile throws when gameLiveInfo is missing", async () => {
  await assertRejects(
    () =>
      Effect.runPromise(extractRoomProfile(makePage({ gameLiveInfo: "null" }))),
    Error,
    "Huya live info is empty",
  );
});

Deno.test("extractRoomProfile upgrades http cover to https", async () => {
  const profile = await Effect.runPromise(extractRoomProfile(
    makePage({ screenshot: "http://example.com/cover.jpg" }),
  ));
  assertEquals(profile?.cover, "https://example.com/cover.jpg");
});

Deno.test("extractRoomProfile handles escaped JSON strings", async () => {
  const profile = await Effect.runPromise(extractRoomProfile(
    makePage({
      gameLiveInfo:
        '{"introduction":"\\u56de\\u653e","screenshot":"","bitRate":0}',
    }),
  ));
  assertEquals(profile?.title, "回放");
});
