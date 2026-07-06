import { Chunk, Data, Effect, Option, Stream } from "effect";
import type { EffectSource, Source } from "@stream-fetcher/core/types";
import { toSource } from "@stream-fetcher/core/adapters/effect";
import { messages } from "@stream-fetcher/core/messages";

class PlaylistRequestError
  extends Data.TaggedError("PlaylistRequestError")<{ status: number }> {}

class PlaylistTextError
  extends Data.TaggedError("PlaylistTextError")<{ cause: unknown }> {}

class PlaylistAbortedError extends Data.TaggedError("PlaylistAbortedError") {}

class SegmentRequestError
  extends Data.TaggedError("SegmentRequestError")<{ status: number }> {}

type HlsError =
  | PlaylistRequestError
  | PlaylistTextError
  | PlaylistAbortedError
  | SegmentRequestError;

function hlsErrorToError(err: HlsError): Error {
  switch (err._tag) {
    case "PlaylistRequestError":
      return new Error(
        `${messages.errors.hlsPlaylistRequestFailed}: ${err.status}`,
      );
    case "PlaylistTextError":
      return err.cause instanceof Error
        ? new Error(
          `${messages.errors.hlsPlaylistTextReadFailed}: ${err.cause.message}`,
        )
        : new Error(messages.errors.hlsPlaylistTextReadFailed);
    case "PlaylistAbortedError":
      return new Error(messages.errors.hlsPlaylistRequestAborted);
    case "SegmentRequestError":
      return new Error(
        `${messages.errors.hlsSegmentRequestFailed}: ${err.status}`,
      );
  }
}

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
          Effect.catchTag("PlaylistAbortedError", () =>
            Effect.succeed(
              Option.none<[Chunk.Chunk<Uint8Array>, PollState]>(),
            )),
          Effect.mapError(hlsErrorToError),
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
): Effect.Effect<
  ParsedPlaylist,
  PlaylistRequestError | PlaylistTextError | PlaylistAbortedError,
  never
> {
  return Effect.tryPromise({
    try: () => fetch(url, { headers, signal }),
    catch: (err) =>
      isAbortError(err)
        ? new PlaylistAbortedError()
        : new PlaylistRequestError({ status: 0 }),
  }).pipe(
    Effect.flatMap((response) =>
      response.ok
        ? Effect.succeed(response)
        : Effect.fail(new PlaylistRequestError({ status: response.status }))
    ),
    Effect.flatMap((response) =>
      Effect.tryPromise({
        try: () => response.text(),
        catch: (err) => new PlaylistTextError({ cause: err }),
      })
    ),
    Effect.map(parsePlaylist),
  );
}

function parsePlaylist(text: string): ParsedPlaylist {
  const lines = text.split(/\r?\n/);
  const isEndlist = lines.some((line) => line.trim() === "#EXT-X-ENDLIST");
  const segmentLines = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return { isEndlist, segmentLines };
}

function segmentUrls(playlist: ParsedPlaylist, baseUrl: URL): string[] {
  return playlist.segmentLines.map((line) => resolveUrl(line, baseUrl).href);
}

function resolveUrl(value: string, baseUrl: URL): URL {
  return URL.canParse(value) ? new URL(value) : new URL(value, baseUrl);
}

function fetchSegment(
  url: string,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
): Effect.Effect<Uint8Array, SegmentRequestError, never> {
  return Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { headers, signal });
      if (!response.ok) {
        throw new SegmentRequestError({ status: response.status });
      }
      return new Uint8Array(await response.arrayBuffer());
    },
    catch: (err) =>
      err instanceof SegmentRequestError
        ? err
        : new SegmentRequestError({ status: 0 }),
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

function isAbortError(err: unknown): err is DOMException {
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
