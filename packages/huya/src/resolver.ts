import type { ResolvedStream, Resolver } from "@stream-fetcher/core/types";
import { HlsSource } from "@stream-fetcher/core/sources/hls";
import { HttpSource } from "@stream-fetcher/core/sources/http";
import md5 from "md5";
import { messages } from "./messages.ts";

const HUYA_WEB_BASE_URL = "https://www.huya.com";
const HUYA_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export enum HuyaProtocol {
  Flv = "flv",
  Hls = "hls",
}

export interface HuyaResolverOptions {
  /** Preferred stream protocol. Defaults to "flv". */
  protocol?: HuyaProtocol;
  /** Preferred CDN name (e.g. "TX", "HW"). Defaults to highest priority CDN. */
  cdn?: string;
  /** Preferred max bitrate. Defaults to 0 (no ratio filter). */
  maxRatio?: number;
  /** Internal: override the web base URL for tests. */
  _webBase?: string;
}

interface StreamInfo {
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

interface BitrateInfo {
  iBitRate: number;
}

interface RoomProfile {
  title: string;
  cover: string;
  maxBitrate: number;
  bitrateInfo: BitrateInfo[];
  streamInfo: StreamInfo[];
}

/** Resolves Huya live room URLs into a ResolvedStream. */
export class HuyaResolver implements Resolver<HuyaResolverOptions> {
  readonly platform = "huya";
  readonly #roomPattern = /(?:https?:\/\/)?(?:www\.|m\.)?huya\.com\/([\w-]+)/;

  canHandle(url: string): boolean {
    return this.#roomPattern.test(url);
  }

  async resolve(
    url: string,
    options: HuyaResolverOptions = {},
  ): Promise<ResolvedStream> {
    const match = this.#roomPattern.exec(url);
    if (!match) throw new Error(messages.errors.invalidUrl(url));
    const roomId = match[1];

    const {
      protocol = HuyaProtocol.Flv,
      cdn,
      maxRatio = 0,
      _webBase,
    } = options;

    const isHls = protocol === HuyaProtocol.Hls;
    const headers = {
      "user-agent": HUYA_USER_AGENT,
      referer: url,
    };

    const { streamUrl, title, cover, maxBitrate } = await this.#fetchStreamUrl(
      url,
      roomId,
      protocol,
      cdn?.toUpperCase(),
      maxRatio,
      _webBase,
    );

    const metadata = {
      platform: this.platform,
      format: protocol,
      title,
      roomId,
      playUrl: streamUrl,
      cover,
      maxBitrate,
      resolvedAt: new Date(),
    };

    const source = isHls ? new HlsSource() : new HttpSource();
    const sourceOptions = isHls
      ? { playlistUrl: streamUrl, headers }
      : { url: streamUrl, headers };

    return {
      metadata,
      source: {
        name: "huya",
        open: () => source.open(sourceOptions as never),
      },
    };
  }

  async #fetchStreamUrl(
    referer: string,
    roomId: string,
    protocol: HuyaProtocol,
    preferredCdn: string | undefined,
    maxRatio: number,
    webBase: string | undefined,
  ): Promise<
    { streamUrl: string; title: string; cover: string; maxBitrate: number }
  > {
    const page = await this.#getRoomPage(referer, roomId, webBase);

    if (
      page.includes(messages.pageMarkers.roomNotFound) ||
      page.includes(messages.pageMarkers.roomBanned)
    ) {
      throw new Error(messages.errors.roomUnavailable);
    }

    const profile = this.#extractRoomProfile(page);
    if (!profile) {
      throw new Error(messages.errors.offlineOrMissingData);
    }

    if (this.#isReplay(profile.title)) {
      throw new Error(messages.errors.replay);
    }

    const streamUrls = this.#buildStreamUrls(profile.streamInfo, protocol);
    const selectedUrl = this.#selectStreamUrl(streamUrls, preferredCdn);
    const streamUrl = this.#applyRatio(
      selectedUrl,
      profile.bitrateInfo,
      profile.maxBitrate,
      maxRatio,
    );

    return {
      streamUrl,
      title: profile.title,
      cover: profile.cover,
      maxBitrate: profile.maxBitrate,
    };
  }

  async #getRoomPage(
    referer: string,
    roomId: string,
    webBase: string | undefined,
  ): Promise<string> {
    const base = (webBase ?? HUYA_WEB_BASE_URL).replace(/\/$/, "");
    const response = await fetch(`${base}/${roomId}`, {
      headers: {
        referer,
        "user-agent": HUYA_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(messages.errors.roomPageRequestFailed(response.status));
    }

    return this.#decodeHtmlEntities(await response.text());
  }

  #extractRoomProfile(page: string): RoomProfile | null {
    const roomData = this.#extractJsonAfter(
      page,
      /var\s+TT_ROOM_DATA\s*=\s*/,
      ";",
    );
    const roomState = typeof roomData.state === "string" ? roomData.state : "";

    const stream = this.#extractStreamJson(page);
    const bitrateInfo = Array.isArray(stream.vMultiStreamInfo)
      ? stream.vMultiStreamInfo
      : [];

    if (roomState !== "ON" || bitrateInfo.length === 0) {
      return null;
    }

    const data = Array.isArray(stream.data) ? stream.data : [];
    const first = data[0];
    if (!first || typeof first !== "object") {
      throw new Error(messages.errors.streamDataEmpty);
    }

    const gameLiveInfo = first.gameLiveInfo;
    if (!gameLiveInfo || typeof gameLiveInfo !== "object") {
      throw new Error(messages.errors.liveInfoEmpty);
    }

    const streamInfo = Array.isArray(first.gameStreamInfoList)
      ? first.gameStreamInfoList
      : [];
    if (streamInfo.length === 0) {
      return null;
    }

    return {
      title: typeof gameLiveInfo.introduction === "string"
        ? gameLiveInfo.introduction
        : "",
      cover: typeof gameLiveInfo.screenshot === "string"
        ? gameLiveInfo.screenshot.replace(/^http:/, "https:")
        : "",
      maxBitrate: typeof gameLiveInfo.bitRate === "number"
        ? gameLiveInfo.bitRate
        : 0,
      bitrateInfo: bitrateInfo as BitrateInfo[],
      streamInfo: streamInfo as StreamInfo[],
    };
  }

  #isReplay(title: string): boolean {
    const { startsWith, endsWith } = messages.replayMarkers;
    return startsWith.some((m) => title.startsWith(m)) ||
      endsWith.some((m) => title.endsWith(m));
  }

  #buildStreamUrls(
    streamsInfo: StreamInfo[],
    protocol: HuyaProtocol,
  ): Array<{ cdn: string; priority: number; url: string }> {
    const isHls = protocol === HuyaProtocol.Hls;
    const urlKey = isHls ? "sHlsUrl" : "sFlvUrl";
    const suffixKey = isHls ? "sHlsUrlSuffix" : "sFlvUrlSuffix";
    const antiCodeKey = isHls ? "sHlsAntiCode" : "sFlvAntiCode";

    const streams: Array<{ cdn: string; priority: number; url: string }> = [];

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

      const query = this.#buildAntiCode(streamName, antiCode);
      const url = `${baseUrl}/${streamName}.${suffix}?${query}&codec=264`;
      streams.push({ cdn, priority, url });
    }

    streams.sort((a, b) => b.priority - a.priority);

    return streams.filter((s) => !/^(HY|HUYA|HYZJ)$/i.test(s.cdn));
  }

  #selectStreamUrl(
    streamUrls: Array<{ cdn: string; url: string }>,
    preferredCdn: string | undefined,
  ): string {
    const selected = preferredCdn && preferredCdn.length > 0
      ? streamUrls.find((s) => s.cdn === preferredCdn)
      : undefined;
    const result = selected ?? streamUrls[0];
    if (!result) {
      throw new Error(messages.errors.noUsableCdn);
    }
    return result.url;
  }

  #applyRatio(
    url: string,
    bitrateInfo: BitrateInfo[],
    maxBitrate: number,
    maxRatio: number,
  ): string {
    if (maxRatio === 0 || url.includes("&ratio")) {
      return url;
    }

    const ratios = bitrateInfo
      .map((info) =>
        typeof info.iBitRate === "number" ? info.iBitRate : maxBitrate
      )
      .filter((bitrate) => bitrate > 0 && bitrate <= maxRatio);

    const selectedRatio = ratios.length > 0 ? Math.max(...ratios) : 0;
    if (selectedRatio > 0) {
      return `${url}&ratio=${selectedRatio}`;
    }
    return url;
  }

  #buildAntiCode(streamName: string, antiCode: string): string {
    const params = new URLSearchParams(antiCode);
    const fm = params.get("fm");
    if (!fm) {
      return antiCode;
    }

    const ctype = params.get("ctype") ?? "huya_live";
    const platformId = params.get("t") ?? "100";
    const uid = this.#generateRandomUid();
    const nowSecs = Math.floor(Date.now() / 1000);
    const seqId = uid + BigInt(Date.now());
    const secretHash = this.#md5Hex(`${seqId}|${ctype}|${platformId}`);
    const convertUid = this.#rotl64(uid);

    const decodedFm = this.#decodeUrlComponent(fm);
    const secretPrefix = this.#base64Decode(decodedFm.split("_")[0] ?? "");

    let wsTime = params.get("wsTime") ?? "";
    const wsTimeNum = parseInt(wsTime, 16);
    if (Number.isNaN(wsTimeNum) || wsTimeNum < nowSecs + 20 * 60) {
      wsTime = (nowSecs + 24 * 60 * 60).toString(16);
    }

    const secretStr =
      `${secretPrefix}_${convertUid}_${streamName}_${secretHash}_${wsTime}`;
    const wsSecret = this.#md5Hex(secretStr);
    const fs = params.get("fs") ?? "bgct";
    const encodedFm = encodeURIComponent(params.get("fm") ?? "");

    return (
      `wsSecret=${wsSecret}&wsTime=${wsTime}&seqid=${seqId}&ctype=${ctype}` +
      `&ver=1&fs=${fs}&fm=${encodedFm}&t=${platformId}&u=${convertUid}`
    );
  }

  #generateRandomUid(): bigint {
    const rand = Math.floor(Math.random() * 10000);
    if (Math.random() < 0.5) {
      return BigInt(`1234${String(rand).padStart(4, "0")}`);
    }
    const rand2 = Math.floor(Math.random() * 10000000);
    return BigInt(`140000${String(rand2).padStart(7, "0")}`);
  }

  #md5Hex(input: string): string {
    return md5(input);
  }

  #rotl64(value: bigint): bigint {
    const low = value & BigInt(0xFFFFFFFF);
    const rotated = ((low << BigInt(8)) | (low >> BigInt(24))) &
      BigInt(0xFFFFFFFF);
    return rotated | (value & ~BigInt(0xFFFFFFFF));
  }

  #decodeUrlComponent(input: string): string {
    try {
      return decodeURIComponent(input);
    } catch {
      return input;
    }
  }

  #base64Decode(input: string): string {
    const decoded = atob(input);
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i));
    }
    return result;
  }

  #extractJsonAfter(
    page: string,
    pattern: RegExp,
    end: string,
  ): Record<string, unknown> {
    const match = pattern.exec(page);
    if (!match) {
      throw new Error(messages.errors.roomDataNotFound);
    }
    const start = match.index + match[0].length;
    const endIdx = page.indexOf(end, start);
    if (endIdx === -1) {
      throw new Error(messages.errors.roomDataIncomplete);
    }
    const jsonText = page.slice(start, endIdx).trim();
    try {
      return JSON.parse(jsonText) as Record<string, unknown>;
    } catch (err) {
      throw new Error(messages.errors.roomDataParseFailed(err));
    }
  }

  #extractStreamJson(page: string): Record<string, unknown> {
    const marker = "stream: ";
    const start = page.indexOf(marker);
    if (start === -1) {
      throw new Error(messages.errors.streamDataNotFound);
    }
    const valueStart = start + marker.length;
    const end = this.#findJsonValueEnd(page, valueStart);
    if (end === -1) {
      throw new Error(messages.errors.streamDataIncomplete);
    }
    const jsonText = page.slice(valueStart, end).trim();
    try {
      return JSON.parse(jsonText) as Record<string, unknown>;
    } catch (err) {
      throw new Error(messages.errors.streamDataParseFailed(err));
    }
  }

  #findJsonValueEnd(input: string, start: number): number {
    const bytes = new TextEncoder().encode(input);
    let idx = start;
    while (idx < bytes.length && isAsciiWhitespace(bytes[idx])) {
      idx++;
    }

    const opening = bytes[idx];
    const closing = opening === 0x7B ? 0x7D : opening === 0x5B ? 0x5D : 0;
    if (!closing) return -1;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = idx; i < bytes.length; i++) {
      const byte = bytes[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (byte === 0x5C) {
          escaped = true;
        } else if (byte === 0x22) {
          inString = false;
        }
        continue;
      }

      if (byte === 0x22) {
        inString = true;
      } else if (byte === 0x7B || byte === 0x5B) {
        depth++;
      } else if (byte === 0x7D || byte === 0x5D) {
        if (depth === 0) return -1;
        depth--;
        if (depth === 0 && byte === closing) {
          return i + 1;
        }
      }
    }

    return -1;
  }

  #decodeHtmlEntities(input: string): string {
    return input
      .replace(/"/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#x22;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
}

function isAsciiWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0A || byte === 0x0D;
}
