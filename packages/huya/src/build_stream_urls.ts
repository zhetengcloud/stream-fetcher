import { Effect } from "effect";
import md5 from "md5";
import type { StreamInfo } from "./extract_room_profile.ts";
import { messages } from "@stream-fetcher/huya/messages";
import { HuyaAntiCodeDecodeError } from "./errors.ts";

const EXCLUDED_CDN_PATTERN = /^(HY|HUYA|HYZJ)$/i;

export interface StreamUrl {
  cdn: string;
  priority: number;
  url: string;
}

export interface BuildStreamUrlsOptions {
  streamsInfo: StreamInfo[];
  isHls: boolean;
}

interface StreamKeys {
  urlKey: "sFlvUrl" | "sHlsUrl";
  suffixKey: "sFlvUrlSuffix" | "sHlsUrlSuffix";
  antiCodeKey: "sFlvAntiCode" | "sHlsAntiCode";
}

interface ValidStream {
  readonly stream: StreamInfo;
  readonly priority: number;
  readonly streamName: string;
  readonly cdn: string;
  readonly suffix: string;
  readonly antiCode: string;
  readonly baseUrl: string;
}

/** Builds sorted Huya stream URLs from raw stream info as an Effect. */
export function buildStreamUrls(
  options: BuildStreamUrlsOptions,
): Effect.Effect<StreamUrl[], HuyaAntiCodeDecodeError, never> {
  const keys = streamKeys(options.isHls);
  const validStreams = options.streamsInfo
    .map((stream) => toValidStream(stream, keys))
    .filter((s): s is ValidStream => s !== null);

  return Effect.forEach(validStreams, (s) => buildStreamUrl(s), { concurrency: 1 }).pipe(
    Effect.map((streams) =>
      streams
        .sort((a, b) => b.priority - a.priority)
        .filter((s) => !EXCLUDED_CDN_PATTERN.test(s.cdn)),
    ),
  );
}

function streamKeys(isHls: boolean): StreamKeys {
  return isHls
    ? { urlKey: "sHlsUrl", suffixKey: "sHlsUrlSuffix", antiCodeKey: "sHlsAntiCode" }
    : { urlKey: "sFlvUrl", suffixKey: "sFlvUrlSuffix", antiCodeKey: "sFlvAntiCode" };
}

function toValidStream(stream: StreamInfo, keys: StreamKeys): ValidStream | null {
  const priority = typeof stream.iWebPriorityRate === "number" ? stream.iWebPriorityRate : 0;
  if (priority < 0) return null;

  const streamName = stream.sStreamName;
  const cdn = stream.sCdnType;
  const suffix = stream[keys.suffixKey];
  const antiCode = stream[keys.antiCodeKey];
  const baseUrl = stream[keys.urlKey]?.replace(/^http:/, "https:");

  if (!streamName || !cdn || !suffix || !antiCode || !baseUrl) {
    return null;
  }

  return { stream, priority, streamName, cdn, suffix, antiCode, baseUrl };
}

function buildStreamUrl(s: ValidStream): Effect.Effect<StreamUrl, HuyaAntiCodeDecodeError, never> {
  return Effect.map(buildAntiCode(s.streamName, s.antiCode), (query) => ({
    cdn: s.cdn,
    priority: s.priority,
    url: `${s.baseUrl}/${s.streamName}.${s.suffix}?${query}&codec=${messages.stream.codec}`,
  }));
}

function buildAntiCode(
  streamName: string,
  antiCode: string,
): Effect.Effect<string, HuyaAntiCodeDecodeError, never> {
  return Effect.gen(function* () {
    const params = new URLSearchParams(antiCode);
    const fm = params.get("fm");
    if (!fm) {
      return antiCode;
    }

    const ctype = params.get("ctype") ?? messages.stream.antiCode.ctypeDefault;
    const platformId = params.get("t") ?? messages.stream.antiCode.platformIdDefault;
    const uid = generateRandomUid();
    const nowSecs = Math.floor(Date.now() / 1000);
    const seqId = uid + BigInt(Date.now());
    const secretHash = md5(`${seqId}|${ctype}|${platformId}`);
    const convertUid = rotl64(uid);

    const decodedFm = yield* Effect.try({
      try: () => decodeURIComponent(fm),
      catch: (err: unknown) => new HuyaAntiCodeDecodeError({ cause: err }),
    });
    const secretPrefix = atob(decodedFm.split("_")[0] ?? "");

    let wsTime = params.get("wsTime") ?? "";
    const wsTimeNum = parseInt(wsTime, 16);
    if (Number.isNaN(wsTimeNum) || wsTimeNum < nowSecs + 20 * 60) {
      wsTime = (nowSecs + 24 * 60 * 60).toString(16);
    }

    const secretStr = `${secretPrefix}_${convertUid}_${streamName}_${secretHash}_${wsTime}`;
    const wsSecret = md5(secretStr);
    const fs = params.get("fs") ?? messages.stream.antiCode.fsDefault;
    const encodedFm = encodeURIComponent(params.get("fm") ?? "");

    return `wsSecret=${wsSecret}&wsTime=${wsTime}&seqid=${seqId}&ctype=${ctype}&ver=${messages.stream.antiCode.ver}&fs=${fs}&fm=${encodedFm}&t=${platformId}&u=${convertUid}`;
  });
}

function generateRandomUid(): bigint {
  const rand = Math.floor(Math.random() * 10000);
  if (Math.random() < 0.5) {
    return BigInt(`1234${String(rand).padStart(4, "0")}`);
  }
  const rand2 = Math.floor(Math.random() * 10000000);
  return BigInt(`140000${String(rand2).padStart(7, "0")}`);
}

/**
 * Rotates the low 32 bits of `value` left by 8 bits.
 *
 * Huya's anti-crack algorithm expects this transform on the random UID.
 * The high 32 bits are preserved unchanged; only the low 32 bits are rotated.
 */
function rotl64(value: bigint): bigint {
  const low = value & BigInt(0xffffffff);
  const rotated = ((low << BigInt(8)) | (low >> BigInt(24))) & BigInt(0xffffffff);
  return rotated | (value & ~BigInt(0xffffffff));
}
