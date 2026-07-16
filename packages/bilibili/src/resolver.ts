import { Effect } from "effect";
import type { ResolvedStream, Resolver } from "@stream-fetcher/core/types";
import { StreamFetcherError } from "@stream-fetcher/core/errors/base";
import { HlsSource } from "@stream-fetcher/core/sources/hls";
import { HttpSource } from "@stream-fetcher/core/sources/http";
import { messages } from "@stream-fetcher/bilibili/messages";
import {
  BilibiliFetchError,
  BilibiliInvalidUrlError,
  BilibiliPlayUrlError,
  BilibiliPlayUrlRequestError,
  BilibiliStreamUrlNotFoundError,
} from "./errors.ts";

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

export interface BilibiliResolverOptions {
  /** Preferred quality number. Defaults to 10000 (原画). */
  qn?: number;
  /** Preferred stream protocol. Defaults to "flv". */
  protocol?: BilibiliProtocol;
  /** Optional cookie string for authenticated requests. */
  cookie?: string;
  /** Internal: override the API base URL for tests. */
  _apiBase?: string;
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

/** Resolves Bilibili live room URLs into a ResolvedStream. */
export class BilibiliResolver implements Resolver<BilibiliResolverOptions, StreamFetcherError> {
  readonly platform = PLATFORM;

  canHandle(url: string): boolean {
    return ROOM_PATTERN.test(url);
  }

  resolve(
    url: string,
    options: BilibiliResolverOptions = {},
  ): Effect.Effect<ResolvedStream<StreamFetcherError>, StreamFetcherError, never> {
    return Effect.gen(function* () {
      const match = ROOM_PATTERN.exec(url);
      if (!match) {
        return yield* Effect.fail(new BilibiliInvalidUrlError({ url }));
      }
      const roomId = match[1];

      const { qn = 10000, protocol = BilibiliProtocol.Flv, cookie, _apiBase } = options;

      const headers = {
        "user-agent": messages.api.userAgent,
        referer: messages.api.referer,
        ...(cookie ? { cookie } : {}),
      };

      const { streamUrl, title } = yield* fetchStreamUrl(roomId, qn, protocol, cookie, _apiBase);

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

    const headers: Record<string, string> = {
      "user-agent": messages.api.userAgent,
      referer: messages.api.referer,
    };
    if (cookie) headers.cookie = cookie;

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
