import { Effect } from "effect";
import type {
  EffectResolver,
  ResolvedStream,
} from "@stream-fetcher/core/types";
import { HlsSource } from "@stream-fetcher/core/sources/hls";
import { HttpSource } from "@stream-fetcher/core/sources/http";
import { messages } from "@stream-fetcher/huya/messages";
import { fetchRoomPage } from "./fetch_room_page.ts";
import { extractRoomProfile } from "./extract_room_profile.ts";
import { buildStreamUrls } from "./build_stream_urls.ts";
import { applyRatio, selectStreamUrl } from "./select_stream_url.ts";
import { isReplay } from "./replay.ts";

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

/** Resolves Huya live room URLs into a ResolvedStream as an Effect. */
export class HuyaEffectResolver implements EffectResolver<HuyaResolverOptions> {
  readonly platform = messages.platform;
  readonly #roomPattern = /(?:https?:\/\/)?(?:www\.|m\.)?huya\.com\/([\w-]+)/;

  canHandle(url: string): boolean {
    return this.#roomPattern.test(url);
  }

  resolve(
    url: string,
    options: HuyaResolverOptions = {},
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
        protocol = HuyaProtocol.Flv,
        cdn,
        maxRatio = 0,
        _webBase,
      } = options;

      const isHls = protocol === HuyaProtocol.Hls;
      const headers = {
        "user-agent": messages.api.userAgent,
        referer: url,
      };

      const page = yield* fetchRoomPage({
        referer: url,
        roomId,
        webBase: _webBase,
      });

      if (
        page.includes(messages.pageMarkers.roomNotFound) ||
        page.includes(messages.pageMarkers.roomBanned)
      ) {
        return yield* Effect.fail(new Error(messages.errors.roomUnavailable));
      }

      const profile = yield* extractRoomProfile(page);
      if (!profile) {
        return yield* Effect.fail(
          new Error(messages.errors.offlineOrMissingData),
        );
      }

      if (isReplay(profile.title, messages.replayMarkers)) {
        return yield* Effect.fail(new Error(messages.errors.replay));
      }

      const streamUrls = yield* buildStreamUrls({
        streamsInfo: profile.streamInfo,
        isHls,
      });
      const selectedUrl = yield* selectStreamUrl({
        streamUrls,
        preferredCdn: cdn?.toUpperCase(),
      });
      const streamUrl = applyRatio({
        url: selectedUrl,
        bitrateInfo: profile.bitrateInfo,
        maxBitrate: profile.maxBitrate,
        maxRatio,
      });

      const metadata = {
        platform: resolver.platform,
        format: protocol,
        title: profile.title,
        roomId,
        playUrl: streamUrl,
        cover: profile.cover,
        maxBitrate: profile.maxBitrate,
        resolvedAt: new Date(),
      };

      const source = isHls ? new HlsSource() : new HttpSource();
      const sourceOptions = isHls
        ? { playlistUrl: streamUrl, headers }
        : { url: streamUrl, headers };

      return {
        metadata,
        source: {
          name: messages.platform,
          open: () => source.open(sourceOptions as never),
        },
      };
    });
  }
}

const resolver = new HuyaEffectResolver();

/** Resolves Huya live room URLs into a ResolvedStream. */
export class HuyaResolver {
  readonly platform = resolver.platform;

  canHandle(url: string): boolean {
    return resolver.canHandle(url);
  }

  resolve(
    url: string,
    options?: HuyaResolverOptions,
  ): Promise<ResolvedStream> {
    return Effect.runPromise(resolver.resolve(url, options));
  }
}
