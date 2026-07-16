import { Effect } from "effect";
import type { ResolvedStream, Resolver } from "@stream-fetcher/core/types";
import { StreamFetcherError } from "@stream-fetcher/core/errors/base";
import { HlsSource } from "@stream-fetcher/core/sources/hls";
import { HttpSource } from "@stream-fetcher/core/sources/http";
import { messages } from "@stream-fetcher/huya/messages";
import {
  HuyaInvalidUrlError,
  HuyaOfflineOrMissingDataError,
  HuyaReplayError,
  HuyaRoomUnavailableError,
} from "./errors.ts";
import { fetchRoomPage } from "./fetch_room_page.ts";
import { extractRoomProfile } from "./extract_room_profile.ts";
import { buildStreamUrls } from "./build_stream_urls.ts";
import { applyRatio, selectStreamUrl } from "./select_stream_url.ts";
import { isReplay } from "./replay.ts";

export const PLATFORM = "huya";

const ROOM_PATTERN = /(?:https?:\/\/)?(?:www\.|m\.)?huya\.com\/([\w-]+)/;

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

/** Resolves Huya live room URLs into a ResolvedStream. */
export class HuyaResolver implements Resolver<HuyaResolverOptions, StreamFetcherError> {
  readonly platform = PLATFORM;

  canHandle(url: string): boolean {
    return ROOM_PATTERN.test(url);
  }

  resolve(
    url: string,
    options: HuyaResolverOptions = {},
  ): Effect.Effect<ResolvedStream<StreamFetcherError>, StreamFetcherError, never> {
    return Effect.gen(function* () {
      const match = ROOM_PATTERN.exec(url);
      if (!match) {
        return yield* Effect.fail(new HuyaInvalidUrlError({ url }));
      }
      const roomId = match[1];

      const { protocol = HuyaProtocol.Flv, cdn, maxRatio = 0, _webBase } = options;

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
        return yield* Effect.fail(new HuyaRoomUnavailableError());
      }

      const profile = yield* extractRoomProfile(page);
      if (!profile) {
        return yield* Effect.fail(new HuyaOfflineOrMissingDataError());
      }

      if (isReplay(profile.title, messages.replayMarkers)) {
        return yield* Effect.fail(new HuyaReplayError());
      }

      const isHls = protocol === HuyaProtocol.Hls;
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
        platform: PLATFORM,
        format: protocol,
        title: profile.title,
        roomId,
        playUrl: streamUrl,
        cover: profile.cover,
        maxBitrate: profile.maxBitrate,
        resolvedAt: new Date(),
      };

      return {
        metadata,
        source: {
          name: PLATFORM,
          open: () =>
            protocol === HuyaProtocol.Hls
              ? new HlsSource().open({ playlistUrl: streamUrl, headers })
              : new HttpSource().open({ url: streamUrl, headers }),
        },
      };
    });
  }
}
