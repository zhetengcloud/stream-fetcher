# Stream Fetcher / Saver — Design Plan

A minimal Deno/TS library that fetches a live stream and pipes it to file,
S3/OSS, or stdout.

References:

- [biliup/biliup](https://github.com/biliup/biliup)
- [streamlink/streamlink](https://github.com/streamlink/streamlink)

## Goal

- Fetch an HTTP(S) live stream (HLS, progressive HTTP, chunked transfer).
- Pipe raw bytes to a single output (file, S3/OSS, stdout, or a message bus
  sink).
- Graceful abort and basic progress metrics.
- Pluggable platform resolvers for Twitch / YouTube / Bilibili / Huya / Douyu.

## Core Interfaces

```ts
interface Source<T = unknown> {
  readonly name: string;
  open(options?: T): Promise<ReadableStream<Uint8Array>>;
  close?(): Promise<void>;
}

interface Sink<T = unknown> {
  readonly name: string;
  open(options?: T): Promise<WritableStream<Uint8Array>>;
  close?(): Promise<void>;
}

interface RecorderOptions<S, K> {
  source: Source<S>;
  sourceOptions?: S;
  sink: Sink<K>;
  sinkOptions?: K;
  signal?: AbortSignal;
  onError?: (error: unknown, ctx: { source?: string; sink?: string }) => void;
  /** Throughput/health metrics, not completion percentage. */
  onProgress?: (metrics: {
    bytes: number;
    elapsedMs: number;
    bitrateKbps: number;
    chunkCount: number;
  }) => void;
}

interface Resolver<T = unknown> {
  readonly platform: string;
  canHandle(url: string): boolean;
  resolve(url: string, options?: T): Promise<Source>;
}
```

## Layout

```
packages/
  core/               # @stream-fetcher/core
    src/
      types.ts
      recorder.ts
      sources/http.ts
      sinks/file.ts
      sinks/stdout.ts
      sinks/s3.ts
      utils/s3_sign.ts
      adapters/deno.ts
  bilibili/           # @stream-fetcher/bilibili
  huya/               # @stream-fetcher/huya
  twitch/             # @stream-fetcher/twitch (on hold)
  youtube/            # @stream-fetcher/youtube (on hold)
  douyu/              # @stream-fetcher/douyu (on hold)
```

## Stream Start Detection

Planned cross-cutting helper in core that polls a source until it produces a
stream.

```ts
interface DetectorOptions {
  intervalMs: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

interface StreamDetector {
  waitForLive(
    source: Source,
    options: DetectorOptions,
  ): Promise<ReadableStream<Uint8Array>>;
}
```

## Platform Support

A `Resolver<T>` converts a user-facing platform URL into a `Source`.

Implementation order: Bilibili ✅ → Huya ✅. YouTube / Twitch on hold.

The library is designed for microservices / Kubernetes, not an end-user CLI.

## Milestones

| M  | Deliverable                                            | Status  |
| -- | ------------------------------------------------------ | ------- |
| M1 | Core: interfaces, `HttpSource`, `FileSink`, `Recorder` | ✅ Done |
| M2 | `S3Sink`, graceful abort, and single-sink `Recorder`   | ✅ Done |
| M3 | Workspace migration + Bilibili + Huya resolvers        | ✅ Done |
| M4 | README + examples                                      | 🚧 Next |

**On hold:** YouTube / Twitch resolvers.
