import type { Effect, Stream } from "effect";

/** Produces a byte stream from a live source. */
export interface Source<T = unknown> {
  readonly name: string;
  /**
   * Open the byte stream.
   *
   * The returned ReadableStream emits `Uint8Array` chunks and closes when the
   * stream ends. Aborting the underlying request is done via the `signal` in
   * options, if supported.
   */
  open(options?: T): Promise<ReadableStream<Uint8Array>>;
}

/** Effect-based source that produces a byte stream. */
export interface EffectSource<T = unknown> {
  readonly name: string;
  /** Open the byte stream as an Effect stream. */
  open(options?: T): Stream.Stream<Uint8Array, Error, never>;
}

/** Consumes a byte stream and writes it somewhere. */
export interface Sink<T = unknown> {
  readonly name: string;
  /** Consumes the byte stream and resolves when finalized. */
  write(stream: ReadableStream<Uint8Array>, options?: T): Promise<void>;
}

/** Effect-based sink that consumes a byte stream. */
export interface EffectSink<T = unknown> {
  readonly name: string;
  /** Consumes the byte stream and returns an Effect that completes on success. */
  write(
    stream: Stream.Stream<Uint8Array, Error, never>,
    options?: T,
  ): Effect.Effect<
    void,
    Error,
    never
  >;
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

/** Effect-based resolved stream. */
export interface EffectResolvedStream<S = unknown> {
  metadata: StreamMetadata;
  source: EffectSource<S>;
}

/** Converts a platform URL (e.g. Bilibili room) into a ResolvedStream. */
export interface Resolver<T = unknown> {
  readonly platform: string;
  canHandle(url: string): boolean;
  resolve(url: string, options?: T): Promise<ResolvedStream>;
}

/** Effect-based resolver. */
export interface EffectResolver<T = unknown> {
  readonly platform: string;
  canHandle(url: string): boolean;
  resolve(
    url: string,
    options?: T,
  ): Effect.Effect<ResolvedStream, Error, never>;
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
  ): Promise<ReadableStream<Uint8Array>>;
}

/** Effect-based stream detector. */
export interface EffectStreamDetector {
  waitForLive(
    source: EffectSource,
    options: DetectorOptions,
  ): Stream.Stream<Uint8Array, Error, never>;
}

/** Runtime-specific filesystem abstraction for the file sink. */
export interface FileSystem {
  /** Write the byte stream to a file. */
  write(path: string, stream: ReadableStream<Uint8Array>): Promise<void>;
  /** Create a directory (and any parent directories). */
  mkdir(dir: string): Promise<void>;
}

/** Effect-based filesystem abstraction. */
export interface EffectFileSystem {
  /** Write the byte stream to a file. */
  write(
    path: string,
    stream: Stream.Stream<Uint8Array, Error, never>,
  ): Effect.Effect<
    void,
    Error,
    never
  >;
  /** Create a directory (and any parent directories). */
  mkdir(dir: string): Effect.Effect<void, Error, never>;
}
