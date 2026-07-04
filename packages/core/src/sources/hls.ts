import type { Source } from "@stream-fetcher/core/types";
import {
  concatMap,
  finalize,
  from,
  interval,
  map,
  type Observable,
  scan,
  startWith,
  switchMap,
  take,
  takeWhile,
} from "rxjs";

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
 * single Observable.
 *
 * Supports VOD and live (sliding-window) playlists. For live playlists, the
 * source refreshes the playlist at `refreshIntervalMs` and fetches new segments
 * as they appear.
 */
export class HlsSource implements Source<HlsSourceOptions> {
  readonly name = "hls";

  open(options: HlsSourceOptions): Observable<Uint8Array> {
    const abortController = new AbortController();
    const signal = combineSignals(abortController, options.signal);

    return createBytesObservable({
      baseUrl: new URL(options.playlistUrl),
      headers: options.headers,
      refreshIntervalMs: options.refreshIntervalMs ?? 2000,
      maxRefreshCount: options.maxRefreshCount ?? Infinity,
      signal,
    }).pipe(
      finalize(() => abortController.abort()),
    );
  }
}

function combineSignals(
  controller: AbortController,
  external?: AbortSignal,
): AbortSignal {
  if (!external) return controller.signal;
  if (external.aborted) {
    controller.abort();
    return controller.signal;
  }
  external.addEventListener("abort", () => controller.abort());
  return controller.signal;
}

function createBytesObservable(
  ctx: BytesObservableContext,
): Observable<Uint8Array> {
  const initialState: PollState = {
    playlist: null,
    fetched: new Set<string>(),
    pending: [],
  };

  return interval(ctx.refreshIntervalMs).pipe(
    startWith(0),
    takeWhile(() => !ctx.signal.aborted),
    take(ctx.maxRefreshCount + 1),
    concatMap(() => fetchPlaylist(ctx.baseUrl, ctx.headers, ctx.signal)),
    scan((state, playlist) => {
      const segmentUrls = parseSegments(playlist, ctx.baseUrl);
      const pending = segmentUrls.filter((url) => !state.fetched.has(url));
      const fetched = new Set(state.fetched);
      pending.forEach((url) => fetched.add(url));
      return { playlist, fetched, pending };
    }, initialState),
    takeWhile((state) => !state.playlist?.isEndlist, true),
    concatMap((state) =>
      from(state.pending).pipe(
        concatMap((url) => fetchSegment(url, ctx.headers, ctx.signal)),
      )
    ),
  );
}

function fetchPlaylist(
  url: URL,
  headers: Record<string, string> | undefined,
  signal: AbortSignal,
): Observable<ParsedPlaylist> {
  return from(fetch(url, { headers, signal })).pipe(
    switchMap((response) => {
      if (!response.ok) {
        throw new Error(`HLS playlist request failed: ${response.status}`);
      }
      return from(response.text());
    }),
    map((text) => parsePlaylist(text)),
  );
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

function parseSegments(playlist: ParsedPlaylist, baseUrl: URL): string[] {
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
): Observable<Uint8Array> {
  return from(fetch(url, { headers, signal })).pipe(
    switchMap(async (response) => {
      if (!response.ok) {
        throw new Error(`HLS segment request failed: ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    }),
  );
}

interface BytesObservableContext {
  baseUrl: URL;
  headers: Record<string, string> | undefined;
  refreshIntervalMs: number;
  maxRefreshCount: number;
  signal: AbortSignal;
}

interface PollState {
  playlist: ParsedPlaylist | null;
  fetched: Set<string>;
  pending: string[];
}

interface ParsedPlaylist {
  isEndlist: boolean;
  segmentLines: string[];
}
