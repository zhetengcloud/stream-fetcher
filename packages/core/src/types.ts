import type { Observable } from "rxjs";

/** Produces a byte stream from a live source. */
export interface Source<T = unknown> {
  readonly name: string;
  /**
   * Open the byte stream.
   *
   * The returned Observable emits `Uint8Array` chunks and completes when the
   * stream ends. Unsubscribing aborts the underlying request.
   */
  open(options?: T): Observable<Uint8Array>;
}

/** Consumes a byte stream and writes it somewhere. */
export interface Sink<T = unknown> {
  readonly name: string;
  /** Consumes the source observable and completes/errors when finalized. */
  write(source$: Observable<Uint8Array>, options?: T): Observable<void>;
}

/** Metadata describing a resolved live stream. */
export interface StreamMetadata {
  /** Platform that produced the stream (e.g. "bilibili", "huya"). */
  platform: string;
  /** Container/protocol format (e.g. "flv", "hls"). */
  format: string;
  /** Human-readable stream title. */
  title?: string;
  /** Platform room identifier. */
  roomId?: string;
  /** Display name of the streamer, if available. */
  anchor?: string;
  /** URL resolved for playback. */
  playUrl: string;
  /** Cover image URL, if available. */
  cover?: string;
  /** Maximum bitrate advertised by the platform, in bits per second. */
  maxBitrate?: number;
  /** Time the stream metadata was produced. */
  resolvedAt?: Date;
}

/** Result of resolving a platform URL: structured metadata plus the byte Source. */
export interface ResolvedStream<S = unknown> {
  metadata: StreamMetadata;
  source: Source<S>;
}

/** Configuration for a recording session. */
export interface RecorderOptions<S, K> {
  source: Source<S>;
  sourceOptions?: S;
  sink: Sink<K>;
  sinkOptions?: K;
  signal?: AbortSignal;
  /** Progress emit interval in milliseconds. Defaults to 1000. */
  progressIntervalMs?: number;
}

/** Converts a platform URL (e.g. Bilibili room) into a ResolvedStream. */
export interface Resolver<T = unknown> {
  readonly platform: string;
  canHandle(url: string): boolean;
  resolve(url: string, options?: T): Observable<ResolvedStream>;
}

/** Options for StreamDetector polling. */
export interface DetectorOptions {
  intervalMs: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

/** Polls a source until it becomes live. */
export interface StreamDetector {
  waitForLive(
    source: Source,
    options: DetectorOptions,
  ): Observable<Uint8Array>;
}

/** Runtime-specific filesystem abstraction for the file sink. */
export interface FileSystem {
  /** Write the byte stream to a file. */
  write(path: string, source$: Observable<Uint8Array>): Observable<void>;
  /** Create a directory (and any parent directories). */
  mkdir(dir: string): Observable<void>;
}
