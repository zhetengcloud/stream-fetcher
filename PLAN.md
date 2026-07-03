# Stream Fetcher / Saver — Design Plan

A minimal Deno/TS library that fetches a live stream and pipes it to file, S3/OSS, or stdout.

References:
- [biliup/biliup](https://github.com/biliup/biliup)
- [streamlink/streamlink](https://github.com/streamlink/streamlink)

## Goal

- Fetch an HTTP(S) live stream (HLS, progressive HTTP, chunked transfer).
- Pipe raw bytes to one or more outputs.
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
  sinks: Array<Sink<K>>;
  sinkOptions?: K[];
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
  bilibili/           # @stream-fetcher/bilibili
  huya/               # @stream-fetcher/huya
  twitch/             # @stream-fetcher/twitch
  youtube/            # @stream-fetcher/youtube (experimental)
  douyu/              # @stream-fetcher/douyu (experimental)
```

## Platform Support

A `Resolver` converts a user-facing platform URL into a `Source`:

```ts
interface Resolver {
  readonly platform: string;
  canHandle(url: string): boolean;
  resolve(url: string, options?: unknown): Promise<Source>;
}
```

Each platform lives in its own workspace package. Core stays platform-agnostic.

Implementation order: Bilibili → Huya. YouTube / Twitch on hold.

The library is designed for microservices / Kubernetes, not an end-user CLI.

## Milestones

| M | Deliverable |
|---|-------------|
| M1 | Core: interfaces, `HttpSource`, `FileSink`, `Recorder` |
| M2 | `S3Sink`, multi-sink tee, abort |
| M3 | Workspace migration + Bilibili + Huya resolvers |
| M4 | README + examples |

**On hold:** YouTube / Twitch resolvers.
