import md5 from "md5";
import type { StreamInfo } from "./extract_room_profile.ts";
import { messages } from "@stream-fetcher/huya/messages";

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

/** Builds sorted Huya stream URLs from raw stream info. */
export function buildStreamUrls(
  options: BuildStreamUrlsOptions,
): StreamUrl[] {
  const { streamsInfo, isHls } = options;
  const urlKey = isHls ? "sHlsUrl" : "sFlvUrl";
  const suffixKey = isHls ? "sHlsUrlSuffix" : "sFlvUrlSuffix";
  const antiCodeKey = isHls ? "sHlsAntiCode" : "sFlvAntiCode";

  const streams: StreamUrl[] = [];

  for (const stream of streamsInfo) {
    const priority = typeof stream.iWebPriorityRate === "number"
      ? stream.iWebPriorityRate
      : 0;
    if (priority < 0) continue;

    const streamName = stream.sStreamName;
    const cdn = stream.sCdnType;
    const suffix = stream[suffixKey];
    const antiCode = stream[antiCodeKey];
    const baseUrl = stream[urlKey]?.replace(/^http:/, "https:");

    if (!streamName || !cdn || !suffix || !antiCode || !baseUrl) {
      continue;
    }

    const query = buildAntiCode(streamName, antiCode);
    const url =
      `${baseUrl}/${streamName}.${suffix}?${query}&codec=${messages.stream.codec}`;
    streams.push({ cdn, priority, url });
  }

  streams.sort((a, b) => b.priority - a.priority);

  return streams.filter((s) => !EXCLUDED_CDN_PATTERN.test(s.cdn));
}

function buildAntiCode(streamName: string, antiCode: string): string {
  const params = new URLSearchParams(antiCode);
  const fm = params.get("fm");
  if (!fm) {
    return antiCode;
  }

  const ctype = params.get("ctype") ?? messages.stream.antiCode.ctypeDefault;
  const platformId = params.get("t") ??
    messages.stream.antiCode.platformIdDefault;
  const uid = generateRandomUid();
  const nowSecs = Math.floor(Date.now() / 1000);
  const seqId = uid + BigInt(Date.now());
  const secretHash = md5Hex(`${seqId}|${ctype}|${platformId}`);
  const convertUid = rotl64(uid);

  const decodedFm = decodeUrlComponent(fm);
  const secretPrefix = base64Decode(decodedFm.split("_")[0] ?? "");

  let wsTime = params.get("wsTime") ?? "";
  const wsTimeNum = parseInt(wsTime, 16);
  if (Number.isNaN(wsTimeNum) || wsTimeNum < nowSecs + 20 * 60) {
    wsTime = (nowSecs + 24 * 60 * 60).toString(16);
  }

  const secretStr =
    `${secretPrefix}_${convertUid}_${streamName}_${secretHash}_${wsTime}`;
  const wsSecret = md5Hex(secretStr);
  const fs = params.get("fs") ?? messages.stream.antiCode.fsDefault;
  const encodedFm = encodeURIComponent(params.get("fm") ?? "");

  return (
    `wsSecret=${wsSecret}&wsTime=${wsTime}&seqid=${seqId}&ctype=${ctype}` +
    `&ver=${messages.stream.antiCode.ver}&fs=${fs}&fm=${encodedFm}&t=${platformId}&u=${convertUid}`
  );
}

function generateRandomUid(): bigint {
  const rand = Math.floor(Math.random() * 10000);
  if (Math.random() < 0.5) {
    return BigInt(`1234${String(rand).padStart(4, "0")}`);
  }
  const rand2 = Math.floor(Math.random() * 10000000);
  return BigInt(`140000${String(rand2).padStart(7, "0")}`);
}

function md5Hex(input: string): string {
  return md5(input);
}

function rotl64(value: bigint): bigint {
  const low = value & BigInt(0xFFFFFFFF);
  const rotated = ((low << BigInt(8)) | (low >> BigInt(24))) &
    BigInt(0xFFFFFFFF);
  return rotated | (value & ~BigInt(0xFFFFFFFF));
}

function decodeUrlComponent(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function base64Decode(input: string): string {
  const decoded = atob(input);
  let result = "";
  for (let i = 0; i < decoded.length; i++) {
    result += String.fromCharCode(decoded.charCodeAt(i));
  }
  return result;
}
