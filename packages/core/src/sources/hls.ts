import { Chunk, Effect, Option, Stream } from "effect";
import type { EffectSource, Source } from "@stream-fetcher/core/types";
import { toSource } from "@stream-fetcher/core/adapters/effect";
import { messages } from "@stream-fetcher/core/messages";

/** Options for the HLS source. */
export interface HlsSourceOptions {
  /** URL of the HLS playlist (typically ending in .m3u8). */
  playlistUrl: string | URL;
  /** Optional headers for playlist and segment requests. */
  headers?: Record<string, string>;
  /** AbortSignal for cancelling the stream. */
  signal?: AbortSignal;
  /** Polling interval for live playlists in milliseconds. Defaults to 2000. */
  refreshIntervalMs?: number;
  /**
   * Maximum number of playlist refreshes for live playlists. Useful for testing
   * or bounded polling. Defaults to unlimited.
   */
  maxRefreshCount?: number;
}

/**
 * Fetches an HLS playlist and emits the concatenated bytes of its segments as a
 * single stream.
 *
 * Supports VOD and live (sliding-window) playlists. For live playlists, the
 * source refreshes the playlist at `refreshIntervalMs` and fetches new segments
 * as they appear.
 */
export class HlsEffectSource implements EffectSource<HlsSourceOptions> {
  readonly name = "hls";

  open(options: HlsSourceOptions): Stream.Stream<Uint8Array, Error, never> {
    const baseUrl = new URL(options.playlistUrl);
    const headers = options.headers;
    const signal = options.signal ?? new AbortController().signal;
    const refreshIntervalMs = options.refreshIntervalMs ??
      messages.defaults.hlsRefreshIntervalMs;
    const maxRefreshCount = options.maxRefreshCount ?? Infinity;

    const initialState: PollState = {
      fetched: new Set<string>(),
      isEndlist: false,
      refreshCount: 0,
    };

    return Stream.unfoldChunkEffect(
      initialState,
      (state) =>
        Effect.gen(function* () {
          if (signal.aborted || state.refreshCount > maxRefreshCount) {
            return Option.none();
          }

          const playlist = yield* fetchPlaylist(baseUrl, headers, signal);
          const pending = segmentUrls(playlist, baseUrl).filter((url) =>
            !state.fetched.has(url)
          );
          const fetched = addAll(state.fetched, pending);

          if (pending.length === 0) {
            if (playlist.isEndlist) {
              return Option.none();
            }
            yield* Effect.sleep(refreshIntervalMs);
            return Option.some<[Chunk.Chunk<Uint8Array>, PollState]>([
              Chunk.empty<Uint8Array>(),
              {
                fetched,
                isEndlist: false,
                refreshCount: state.refreshCount + 1,
              },
            ]);
          }

          const chunks = yield* Effect.forEach(
            pending,
            (url) => fetchSegment(url, headers, signal),
            { concurrency: 1 },
          );

          if (!playlist.isEndlist) {
            yield* Effect.sleep(refreshIntervalMs);
          }

          return Option.some<[Chunk.Chunk<Uint8Array>, PollState]>([
            Chunk.fromIterable(chunks),
            {
              fetched,
              isEndlist: playlist.isEndlist,
              refreshCount: state.refreshCount + 1,
            },
          ]);
        }).pipe(
          Effect.catchAll((err: unknown) =>
            isAbortError(err)
              ? Effect.succeed(
                Option.none<[Chunk.Chunk<Uint8Array>, PollState]>(),
              )
              : Effect.fail(
                err instanceof Error ? err : new Error(String(err)),
              )
          ),
        ),
    );
  }
}

/** Web-standard HLS source. */
export class HlsSource implements Source<HlsSourceOptions> {
  readonly name = "hls";
  readonly #effectSource = new HlsEffectSource();

  open(options: HlsSourceOptions): Promise<ReadableStream<Uint8Array>> {
    return Promise.resolve(
      toSource(this.#effectSource).open(options),
    );
  }
}

function fetchPlaylist(
  url: URL,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
): Effect.Effect<ParsedPlaylist, Error, never> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { headers, signal });
      if (!response.ok) {
        throw new Error(
          `${messages.errors.hlsPlaylistRequestFailed}: ${response.status}`,
        );
      }
      return parsePlaylist(await response.text());
    },
    catch: (err: unknown) =>
      err instanceof Error ? err : new Error(String(err)),
  });
}

function parsePlaylist(text: string): ParsedPlaylist {
  const lines = text.split(/\r?\n/);
  let isEndlist = false;
  const segmentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "#EXT-X-ENDLIST") {
      isEndlist = true;
    } else if (trimmed && !trimmed.startsWith("#")) {
      segmentLines.push(trimmed);
    }
  }

  return { isEndlist, segmentLines };
}

function segmentUrls(playlist: ParsedPlaylist, baseUrl: URL): string[] {
  return playlist.segmentLines.map((line) => resolveUrl(line, baseUrl).href);
}

function resolveUrl(value: string, baseUrl: URL): URL {
  try {
    return new URL(value);
  } catch {
    return new URL(value, baseUrl);
  }
}

function fetchSegment(
  url: string,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
): Effect.Effect<Uint8Array, Error, never> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { headers, signal });
      if (!response.ok) {
        throw new Error(
          `${messages.errors.hlsSegmentRequestFailed}: ${response.status}`,
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    catch: (err: unknown) =>
      err instanceof Error ? err : new Error(String(err)),
  });
}

function addAll(
  set: ReadonlySet<string>,
  values: readonly string[],
): Set<string> {
  const next = new Set(set);
  for (const value of values) {
    next.add(value);
  }
  return next;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

interface PollState {
  fetched: ReadonlySet<string>;
  isEndlist: boolean;
  refreshCount: number;
}

interface ParsedPlaylist {
  isEndlist: boolean;
  segmentLines: string[];
}
