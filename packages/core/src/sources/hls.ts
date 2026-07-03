import type { Source } from "@stream-fetcher/core/types";

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
export class HlsSource implements Source<HlsSourceOptions> {
  readonly name = "hls";
  #abortController = new AbortController();

  open(options: HlsSourceOptions): Promise<ReadableStream<Uint8Array>> {
    const refreshIntervalMs = options.refreshIntervalMs ?? 2000;
    const maxRefreshCount = options.maxRefreshCount ?? Infinity;
    const signal = this.#combineSignals(options.signal);

    return Promise.resolve(
      new ReadableStream<Uint8Array>({
        start: (controller) =>
          this.#run(
            controller,
            options.playlistUrl,
            options.headers,
            refreshIntervalMs,
            maxRefreshCount,
            signal,
          ),
      }),
    );
  }

  close(): Promise<void> {
    this.#abortController.abort();
    return Promise.resolve();
  }

  #combineSignals(external?: AbortSignal): AbortSignal {
    if (!external) return this.#abortController.signal;
    if (external.aborted) {
      this.#abortController.abort();
      return this.#abortController.signal;
    }
    external.addEventListener("abort", () => this.#abortController.abort());
    return this.#abortController.signal;
  }

  async #run(
    controller: ReadableStreamDefaultController<Uint8Array>,
    playlistUrl: string | URL,
    headers: Record<string, string> | undefined,
    refreshIntervalMs: number,
    maxRefreshCount: number,
    signal: AbortSignal,
  ): Promise<void> {
    const baseUrl = new URL(playlistUrl);
    const fetchedSegments = new Set<string>();
    let ended = false;
    let refreshCount = 0;

    try {
      while (!signal.aborted && !ended && refreshCount <= maxRefreshCount) {
        const playlist = await this.#fetchPlaylist(baseUrl, headers, signal);
        const segments = this.#parseSegments(playlist, baseUrl);

        if (segments.length === 0 && playlist.isEndlist) {
          // Empty VOD playlist — nothing to emit.
          break;
        }

        for (const segmentUrl of segments) {
          if (signal.aborted) break;
          if (fetchedSegments.has(segmentUrl)) continue;
          fetchedSegments.add(segmentUrl);

          const bytes = await this.#fetchSegment(segmentUrl, headers, signal);
          controller.enqueue(bytes);
        }

        if (playlist.isEndlist) {
          ended = true;
          break;
        }

        refreshCount++;
        if (refreshCount > maxRefreshCount) {
          break;
        }

        await this.#delay(refreshIntervalMs, signal);
      }

      controller.close();
    } catch (error) {
      controller.error(error);
    }
  }

  async #fetchPlaylist(
    url: URL,
    headers: Record<string, string> | undefined,
    signal: AbortSignal,
  ): Promise<ParsedPlaylist> {
    const response = await fetch(url, { headers, signal });
    if (!response.ok) {
      throw new Error(`HLS playlist request failed: ${response.status}`);
    }
    const text = await response.text();
    return this.#parsePlaylist(text);
  }

  #parsePlaylist(text: string): ParsedPlaylist {
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

  #parseSegments(playlist: ParsedPlaylist, baseUrl: URL): string[] {
    return playlist.segmentLines.map((line) =>
      this.#resolveUrl(line, baseUrl).href
    );
  }

  #resolveUrl(value: string, baseUrl: URL): URL {
    try {
      return new URL(value);
    } catch {
      return new URL(value, baseUrl);
    }
  }

  async #fetchSegment(
    url: string,
    headers: Record<string, string> | undefined,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const response = await fetch(url, { headers, signal });
    if (!response.ok) {
      throw new Error(`HLS segment request failed: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  #delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      });
    });
  }
}

interface ParsedPlaylist {
  isEndlist: boolean;
  segmentLines: string[];
}
