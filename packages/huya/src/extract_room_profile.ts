import { Effect } from "effect";
import { HuyaRoomDataError, HuyaStreamDataError } from "./errors.ts";

export interface StreamInfo {
  sStreamName: string;
  sCdnType: string;
  iWebPriorityRate: number;
  sFlvUrl?: string;
  sFlvUrlSuffix?: string;
  sFlvAntiCode?: string;
  sHlsUrl?: string;
  sHlsUrlSuffix?: string;
  sHlsAntiCode?: string;
}

export interface BitrateInfo {
  iBitRate: number;
}

export interface RoomProfile {
  title: string;
  cover: string;
  maxBitrate: number;
  bitrateInfo: BitrateInfo[];
  streamInfo: StreamInfo[];
}

const ROOM_DATA_PATTERN = /var\s+TT_ROOM_DATA\s*=\s*/;
const ROOM_DATA_END = ";";
const STREAM_OBJECT_MARKER = "stream: ";

/** Extracts the Huya room profile from the HTML page as an Effect. */
export function extractRoomProfile(
  page: string,
): Effect.Effect<RoomProfile | null, HuyaRoomDataError | HuyaStreamDataError, never> {
  return Effect.gen(function* () {
    const roomData = yield* extractJsonAfter(page, ROOM_DATA_PATTERN, ROOM_DATA_END);
    const roomState = typeof roomData.state === "string" ? roomData.state : "";

    const stream = yield* extractStreamJson(page);
    const bitrateInfo = Array.isArray(stream.vMultiStreamInfo) ? stream.vMultiStreamInfo : [];

    if (roomState !== "ON" || bitrateInfo.length === 0) {
      return null;
    }

    const data = Array.isArray(stream.data) ? stream.data : [];
    const first = data[0];
    if (!first || typeof first !== "object") {
      return yield* Effect.fail(new HuyaStreamDataError({ reason: "empty" }));
    }

    const gameLiveInfo = first.gameLiveInfo;
    if (!gameLiveInfo || typeof gameLiveInfo !== "object") {
      return yield* Effect.fail(new HuyaStreamDataError({ reason: "live-info-empty" }));
    }

    const streamInfo = Array.isArray(first.gameStreamInfoList) ? first.gameStreamInfoList : [];
    if (streamInfo.length === 0) {
      return null;
    }

    return {
      title: typeof gameLiveInfo.introduction === "string" ? gameLiveInfo.introduction : "",
      cover:
        typeof gameLiveInfo.screenshot === "string"
          ? gameLiveInfo.screenshot.replace(/^http:/, "https:")
          : "",
      maxBitrate: typeof gameLiveInfo.bitRate === "number" ? gameLiveInfo.bitRate : 0,
      bitrateInfo: bitrateInfo as BitrateInfo[],
      streamInfo: streamInfo as StreamInfo[],
    };
  });
}

function extractJsonAfter(
  page: string,
  pattern: RegExp,
  end: string,
): Effect.Effect<Record<string, unknown>, HuyaRoomDataError, never> {
  return Effect.gen(function* () {
    const match = pattern.exec(page);
    if (!match) {
      return yield* Effect.fail(new HuyaRoomDataError({ reason: "not-found" }));
    }
    const start = match.index + match[0].length;
    const endIdx = page.indexOf(end, start);
    if (endIdx === -1) {
      return yield* Effect.fail(new HuyaRoomDataError({ reason: "incomplete" }));
    }
    const jsonText = page.slice(start, endIdx).trim();
    return yield* Effect.try({
      try: () => JSON.parse(jsonText) as Record<string, unknown>,
      catch: (err: unknown) => new HuyaRoomDataError({ reason: "parse-failed", cause: err }),
    });
  });
}

function extractStreamJson(
  page: string,
): Effect.Effect<Record<string, unknown>, HuyaStreamDataError, never> {
  return Effect.gen(function* () {
    const marker = STREAM_OBJECT_MARKER;
    const start = page.indexOf(marker);
    if (start === -1) {
      return yield* Effect.fail(new HuyaStreamDataError({ reason: "not-found" }));
    }
    const valueStart = start + marker.length;
    const end = findJsonValueEnd(page, valueStart);
    if (end === -1) {
      return yield* Effect.fail(new HuyaStreamDataError({ reason: "incomplete" }));
    }
    const jsonText = page.slice(valueStart, end).trim();
    return yield* Effect.try({
      try: () => JSON.parse(jsonText) as Record<string, unknown>,
      catch: (err: unknown) => new HuyaStreamDataError({ reason: "parse-failed", cause: err }),
    });
  });
}

/**
 * Finds the index just past the end of a JSON object or array that starts
 * somewhere inside `input`.
 *
 * This is needed because the Huya page embeds JSON values inside larger
 * JavaScript source, so `JSON.parse` alone cannot tell us where the value ends.
 * We scan forward from `start`, skipping leading whitespace, then track string
 * literals and balanced `{`/`}` and `[`/`]` pairs until the top-level value is
 * closed.
 *
 * Returns `-1` if the value does not start with `{` or `[`, or if no matching
 * closing bracket is found.
 */
export function findJsonValueEnd(input: string, start: number): number {
  let i = start;
  while (i < input.length && /\s/.test(input[i])) {
    i++;
  }

  const first = input[i];
  if (first !== "{" && first !== "[") {
    return -1;
  }

  let depth = 0;
  let inString = false;

  for (; i < input.length; i++) {
    const ch = input[i];

    if (inString) {
      if (ch === "\\") {
        i++; // skip the escaped character
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{" || ch === "[") {
      depth++;
    } else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
  }

  return -1;
}
