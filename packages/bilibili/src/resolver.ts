import { Effect } from "effect";
import type { ResolvedStream, Resolver } from "@stream-fetcher/core/types";
import { StreamFetcherError } from "@stream-fetcher/core/errors/base";
import { HlsSource } from "@stream-fetcher/core/sources/hls";
import { HttpSource } from "@stream-fetcher/core/sources/http";
import { messages } from "@stream-fetcher/bilibili/messages";
import {
  BilibiliCookieFileError,
  BilibiliCookieFileInvalidError,
  BilibiliFetchError,
  BilibiliInvalidUrlError,
  BilibiliPlayUrlError,
  BilibiliPlayUrlRequestError,
  BilibiliStreamUrlNotFoundError,
} from "./errors.ts";
import { WbiSigner, type WbiKeyCache } from "./wbi.ts";

export const PLATFORM = "bilibili";

const ROOM_PATTERN = /(?:https?:\/\/)?(?:www\.|m\.|live\.)?bilibili\.com\/(?:blanc\/|h5\/)?(\d+)/;

export enum BilibiliProtocol {
  Flv = "flv",
  Hls = "hls",
}

const platformByProtocol: Record<BilibiliProtocol, string> = {
  [BilibiliProtocol.Flv]: "web",
  [BilibiliProtocol.Hls]: "hls",
};

const formatNameByProtocol: Record<BilibiliProtocol, string> = {
  [BilibiliProtocol.Flv]: "flv",
  [BilibiliProtocol.Hls]: "fmp4",
};

export interface BilibiliResolverOptions {
  /** Preferred quality number. Defaults to 10000 (原画). */
  qn?: number;
  /** Preferred stream protocol. Defaults to "flv". */
  protocol?: BilibiliProtocol;
  /** Optional cookie string for authenticated requests. */
  cookie?: string;
  /** Optional path to a cookie file in biliup's `cookie_info.cookies` JSON format. */
  cookieFile?: string;
  /** Use the WBI-signed `getRoomPlayInfo` endpoint instead of the unsigned `playUrl`. */
  useWbi?: boolean;
  /** Internal: override the API base URL for tests. */
  _apiBase?: string;
  /** Internal: override the web-interface base URL for WBI tests. */
  _webInterfaceBase?: string;
}

type StreamUrlResult = { streamUrl: string; title?: string };

interface PlayUrlResponse {
  code: number;
  message?: string;
  data?: {
    current_qn?: number;
    quality_description?: Array<{ qn: number; desc: string }>;
    title?: string;
    durl?: Array<{ url: string }>;
  };
}

interface RoomPlayInfoResponse {
  code: number;
  message?: string;
  data?: {
    title?: string;
    playurl_info?: {
      playurl?: {
        stream?: Array<{
          protocol_name?: string;
          format?: Array<{
            format_name?: string;
            codec?: Array<{
              base_url?: string;
              current_qn?: number;
              url_info?: Array<{ host?: string; extra?: string }>;
            }>;
          }>;
        }>;
      };
    };
  };
}

interface CookieEntry {
  name?: string;
  value?: string;
}

interface CookieFile {
  cookie_info?: {
    cookies?: CookieEntry[];
  };
}

/** Resolves Bilibili live room URLs into a ResolvedStream. */
export class BilibiliResolver implements Resolver<BilibiliResolverOptions, StreamFetcherError> {
  readonly platform = PLATFORM;
  private readonly wbiSigner: WbiSigner;

  constructor(options?: { _webInterfaceBase?: string; cache?: WbiKeyCache }) {
    this.wbiSigner = new WbiSigner(options?._webInterfaceBase, options?.cache);
  }

  canHandle(url: string): boolean {
    return ROOM_PATTERN.test(url);
  }

  resolve(
    url: string,
    options: BilibiliResolverOptions = {},
  ): Effect.Effect<ResolvedStream<StreamFetcherError>, StreamFetcherError, never> {
    const signer = this.wbiSigner;
    return Effect.gen(function* () {
      const match = ROOM_PATTERN.exec(url);
      if (!match) {
        return yield* Effect.fail(new BilibiliInvalidUrlError({ url }));
      }
      const roomId = match[1];

      const {
        qn = 10000,
        protocol = BilibiliProtocol.Flv,
        cookie,
        cookieFile,
        useWbi,
        _apiBase,
      } = options;

      const resolvedCookie = yield* resolveCookie({ cookie, cookieFile });
      const headers = buildHeaders(resolvedCookie);

      const { streamUrl, title } = useWbi
        ? yield* fetchRoomPlayInfo(
            roomId,
            qn,
            protocol,
            headers,
            _apiBase ?? messages.api.baseUrl,
            signer,
          )
        : yield* fetchStreamUrl(roomId, qn, protocol, resolvedCookie, _apiBase);

      const metadata = {
        platform: PLATFORM,
        format: protocol,
        title,
        roomId,
        playUrl: streamUrl,
        resolvedAt: new Date(),
      };

      return {
        metadata,
        source: {
          name: PLATFORM,
          open: () =>
            protocol === BilibiliProtocol.Hls
              ? new HlsSource().open({ playlistUrl: streamUrl, headers })
              : new HttpSource().open({ url: streamUrl, headers }),
        },
      };
    });
  }
}

function resolveCookie(options: {
  cookie?: string;
  cookieFile?: string;
}): Effect.Effect<
  string | undefined,
  BilibiliCookieFileError | BilibiliCookieFileInvalidError,
  never
> {
  return Effect.gen(function* () {
    if (options.cookie !== undefined) {
      return options.cookie;
    }
    if (options.cookieFile === undefined) {
      return undefined;
    }

    const text = yield* Effect.tryPromise({
      try: () => Bun.file(options.cookieFile!).text(),
      catch: (err: unknown) =>
        new BilibiliCookieFileError({ path: options.cookieFile!, cause: err }),
    });

    const parsed = yield* Effect.try({
      try: (): CookieFile => JSON.parse(text) as CookieFile,
      catch: (err: unknown) =>
        new BilibiliCookieFileError({ path: options.cookieFile!, cause: err }),
    });

    const entries = parsed.cookie_info?.cookies;
    if (!Array.isArray(entries) || entries.length === 0) {
      return yield* Effect.fail(new BilibiliCookieFileInvalidError({ path: options.cookieFile! }));
    }

    const cookie = entries
      .filter(
        (entry): entry is CookieEntry & { name: string; value: string } =>
          typeof entry.name === "string" && typeof entry.value === "string",
      )
      .map((entry) => `${entry.name}=${entry.value}`)
      .join(";");

    if (cookie.length === 0) {
      return yield* Effect.fail(new BilibiliCookieFileInvalidError({ path: options.cookieFile! }));
    }

    return cookie;
  });
}

function buildHeaders(cookie: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": messages.api.userAgent,
    referer: messages.api.referer,
  };
  if (cookie) {
    headers.cookie = cookie;
  }
  return headers;
}

function fetchStreamUrl(
  roomId: string,
  qn: number,
  protocol: BilibiliProtocol,
  cookie: string | undefined,
  _apiBase: string | undefined,
): Effect.Effect<StreamUrlResult, StreamFetcherError, never> {
  return Effect.gen(function* () {
    const platform = platformByProtocol[protocol];
    const apiUrl = new URL(
      messages.api.playUrlEndpoint,
      (_apiBase ?? messages.api.baseUrl).replace(/\/$/, "") + "/",
    );
    apiUrl.searchParams.set("cid", roomId);
    apiUrl.searchParams.set("qn", String(qn));
    apiUrl.searchParams.set("platform", platform);

    const headers = buildHeaders(cookie);

    const response = yield* Effect.tryPromise({
      try: () => fetch(apiUrl, { headers }),
      catch: (err: unknown) => new BilibiliFetchError({ cause: err }),
    });

    if (!response.ok) {
      return yield* Effect.fail(new BilibiliPlayUrlRequestError({ status: response.status }));
    }

    const data = yield* Effect.tryPromise({
      try: (): Promise<PlayUrlResponse> => response.json(),
      catch: (err: unknown) =>
        new BilibiliPlayUrlError({
          code: -1,
          message: `${messages.errors.playUrlError}: ${String(err)}`,
        }),
    });
    if (data.code !== 0) {
      return yield* Effect.fail(
        new BilibiliPlayUrlError({ code: data.code, message: data.message }),
      );
    }

    const urls = data.data?.durl;
    if (!urls || urls.length === 0) {
      return yield* Effect.fail(new BilibiliStreamUrlNotFoundError());
    }

    return {
      streamUrl: urls[0].url,
      title: data.data?.title,
    };
  });
}

function fetchRoomPlayInfo(
  roomId: string,
  qn: number,
  protocol: BilibiliProtocol,
  headers: Record<string, string>,
  apiBase: string,
  wbiSigner: WbiSigner,
): Effect.Effect<StreamUrlResult, StreamFetcherError, never> {
  return Effect.gen(function* () {
    const params = new Map<string, string>([
      ["room_id", roomId],
      ["qn", String(qn)],
      ["platform", "html5"],
      ["protocol", "0,1"],
      ["format", "0,1,2"],
      ["codec", "0"],
      ["dolby", "5"],
      ["web_location", messages.api.webLocation],
    ]);

    const signedParams = yield* wbiSigner.sign(params, headers);

    const apiUrl = new URL(messages.api.roomPlayInfoEndpoint, apiBase.replace(/\/$/, "") + "/");
    for (const [key, value] of signedParams) {
      apiUrl.searchParams.set(key, value);
    }

    const response = yield* Effect.tryPromise({
      try: () => fetch(apiUrl, { headers }),
      catch: (err: unknown) => new BilibiliFetchError({ cause: err }),
    });

    if (!response.ok) {
      return yield* Effect.fail(new BilibiliPlayUrlRequestError({ status: response.status }));
    }

    const data = yield* Effect.tryPromise({
      try: (): Promise<RoomPlayInfoResponse> => response.json(),
      catch: (err: unknown) =>
        new BilibiliPlayUrlError({
          code: -1,
          message: `${messages.errors.playUrlError}: ${String(err)}`,
        }),
    });

    if (data.code !== 0) {
      return yield* Effect.fail(
        new BilibiliPlayUrlError({ code: data.code, message: data.message }),
      );
    }

    const streamUrl = extractRoomPlayUrl(data.data, protocol);
    if (!streamUrl) {
      return yield* Effect.fail(new BilibiliStreamUrlNotFoundError());
    }

    return {
      streamUrl,
      title: data.data?.title,
    };
  });
}

function extractRoomPlayUrl(
  data: RoomPlayInfoResponse["data"],
  protocol: BilibiliProtocol,
): string | undefined {
  const targetFormat = formatNameByProtocol[protocol];
  const fallbackFormat = protocol === BilibiliProtocol.Hls ? "ts" : undefined;

  const streams = data?.playurl_info?.playurl?.stream;
  if (!streams || streams.length === 0) return undefined;

  for (const stream of streams) {
    const formats = stream.format;
    if (!formats) continue;

    const format =
      formats.find((f) => f.format_name === targetFormat) ??
      (fallbackFormat ? formats.find((f) => f.format_name === fallbackFormat) : undefined);
    if (!format) continue;

    const codec = format.codec?.[0];
    if (!codec?.base_url) continue;

    const host = codec.url_info?.[0]?.host;
    const extra = codec.url_info?.[0]?.extra;
    if (!host || !extra) continue;

    return `${host}${codec.base_url}${extra}`;
  }

  return undefined;
}
