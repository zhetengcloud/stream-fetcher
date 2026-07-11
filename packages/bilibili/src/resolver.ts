import { Effect } from "effect";
import type { ResolvedStream, Resolver } from "@stream-fetcher/core/types";
import { HlsSource } from "@stream-fetcher/core/sources/hls";
import { HttpSource } from "@stream-fetcher/core/sources/http";
import { messages } from "@stream-fetcher/bilibili/messages";

export enum BilibiliProtocol {
  Flv = "flv",
  Hls = "hls",
}

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
export class BilibiliResolver implements Resolver<BilibiliResolverOptions> {
  readonly platform = messages.platform;
  readonly #roomPattern =
    /(?:https?:\/\/)?(?:www\.|m\.|live\.)?bilibili\.com\/(?:blanc\/|h5\/)?(\d+)/;

  canHandle(url: string): boolean {
    return this.#roomPattern.test(url);
  }

  resolve(
    url: string,
    options: BilibiliResolverOptions = {},
  ): Effect.Effect<ResolvedStream, Error, never> {
    return Effect.gen(function* () {
      const match = resolver.#roomPattern.exec(url);
      if (!match) {
        return yield* Effect.fail(
          new Error(`${messages.errors.invalidUrl}: ${url}`),
        );
      }
      const roomId = match[1];

      const {
        qn = 10000,
        protocol = BilibiliProtocol.Flv,
        cookie,
        _apiBase,
      } = options;

      const isHls = protocol === BilibiliProtocol.Hls;
      const headers = {
        "user-agent": messages.api.userAgent,
        referer: messages.api.referer,
        ...(cookie ? { cookie } : {}),
      };

      const { streamUrl, title } = yield* fetchStreamUrl(
        roomId,
        qn,
        protocol,
        cookie,
        _apiBase,
      );

      const metadata = {
        platform: resolver.platform,
        format: protocol,
        title,
        roomId,
        playUrl: streamUrl,
        resolvedAt: new Date(),
      };

      if (isHls) {
        const source = new HlsSource();
        return {
          metadata,
          source: {
            name: messages.platform,
            open: () => source.open({ playlistUrl: streamUrl, headers }),
          },
        };
      }

      const source = new HttpSource();
      return {
        metadata,
        source: {
          name: messages.platform,
          open: () => source.open({ url: streamUrl, headers }),
        },
      };
    });
  }
}

const resolver = new BilibiliResolver();

function fetchStreamUrl(
  roomId: string,
  qn: number,
  protocol: BilibiliProtocol,
  cookie: string | undefined,
  _apiBase: string | undefined,
): Effect.Effect<{ streamUrl: string; title?: string }, Error, never> {
  return Effect.gen(function* () {
    const platform = protocol === BilibiliProtocol.Hls
      ? messages.api.platforms.hls
      : messages.api.platforms.web;
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
      catch: (err: unknown) =>
        err instanceof Error ? err : new Error(String(err)),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new Error(
          `${messages.errors.playUrlRequestFailed}: ${response.status}`,
        ),
      );
    }

    const data = (yield* Effect.tryPromise(() =>
      response.json()
    )) as PlayUrlResponse;
    if (data.code !== 0) {
      return yield* Effect.fail(
        new Error(
          `${messages.errors.playUrlError}: ${
            data.message ?? `code ${data.code}`
          }`,
        ),
      );
    }

    const urls = data.data?.durl;
    if (!urls || urls.length === 0) {
      return yield* Effect.fail(
        new Error(messages.errors.streamUrlNotFound),
      );
    }

    return {
      streamUrl: urls[0].url,
      title: data.data?.title,
    };
  });
}
