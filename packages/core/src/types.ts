/** Lifecycle states of a Recorder. */
export enum RecorderStatus {
  Idle = "idle",
  Running = "running",
  Stopped = "stopped",
  Error = "error",
}

/** Produces a byte stream from a live source. */
export interface Source<T = unknown> {
  readonly name: string;
  /** Open the stream. The returned ReadableStream must be closed by the caller. */
  open(options?: T): Promise<ReadableStream<Uint8Array>>;
  /** Optional cleanup after the stream ends. */
  close?(): Promise<void>;
}

/** Consumes a byte stream and writes it somewhere. */
export interface Sink<T = unknown> {
  readonly name: string;
  /** Open a writable destination. The caller will close it. */
  open(options?: T): Promise<WritableStream<Uint8Array>>;
  /** Optional cleanup after the destination closes. */
  close?(): Promise<void>;
}

/** Configuration for a recording session. */
export interface RecorderOptions<S, K> {
  source: Source<S>;
  sourceOptions?: S;
  sinks: Array<Sink<K>>;
  sinkOptions?: K[];
  signal?: AbortSignal;
  /** Progress emit interval in milliseconds. Defaults to 1000. */
  progressIntervalMs?: number;
  /** Called with throughput/health metrics at progressIntervalMs cadence. */
  onError?: (error: unknown, ctx: { source?: string; sink?: string }) => void;
  onProgress?: (metrics: {
    bytes: number;
    elapsedMs: number;
    bitrateKbps: number;
    chunkCount: number;
  }) => void;
}

/** Converts a platform URL (e.g. Bilibili room) into a Source. */
export interface Resolver<T = unknown> {
  readonly platform: string;
  canHandle(url: string): boolean;
  resolve(url: string, options?: T): Promise<Source>;
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

/** Runtime-specific filesystem abstraction for the file sink. */
export interface FileSystem {
  open(path: string): Promise<WritableStream<Uint8Array>>;
  mkdir(dir: string): Promise<void>;
}
