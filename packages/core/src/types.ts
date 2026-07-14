import type { Effect, Stream } from "effect";

/** Produces a byte stream from a live source. */
export interface Source<E = Error, T = unknown> {
  readonly name: string;
  /** Open the byte stream as an Effect stream. */
  open(options?: T): Stream.Stream<Uint8Array, E, never>;
}

/** Consumes a byte stream and writes it somewhere. */
export interface Sink<E = Error, T = unknown> {
  readonly name: string;
  /** Consumes the byte stream and returns an Effect that completes on success. */
  write(
    stream: Stream.Stream<Uint8Array, E, never>,
    options?: T,
  ): Effect.Effect<void, E, never>;
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
export interface ResolvedStream<E = Error, S = unknown> {
  metadata: StreamMetadata;
  source: Source<E, S>;
}

/** Converts a platform URL (e.g. Bilibili room) into a ResolvedStream. */
export interface Resolver<T = unknown, E = Error> {
  readonly platform: string;
  canHandle(url: string): boolean;
  resolve(
    url: string,
    options?: T,
  ): Effect.Effect<ResolvedStream<E>, Error, never>;
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
    source: Source<Error>,
    options: DetectorOptions,
  ): Stream.Stream<Uint8Array, Error, never>;
}

/** Runtime-specific filesystem abstraction for the file sink. */
export interface FileSystem<E = Error> {
  /** Write the byte stream to a file. */
  write(
    path: string,
    stream: Stream.Stream<Uint8Array, E, never>,
  ): Effect.Effect<void, E, never>;
  /** Create a directory (and any parent directories). */
  mkdir(dir: string): Effect.Effect<void, E, never>;
}
