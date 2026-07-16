# Stream Fetcher / Saver — Design Plan

A minimal Bun/TypeScript library that fetches a live stream and pipes it to
file, S3/OSS, or stdout.

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
  open(options?: T): Stream.Stream<Uint8Array, Error, never>;
}

interface Sink<T = unknown> {
  readonly name: string;
  write(
    stream: Stream.Stream<Uint8Array, Error, never>,
    options?: T,
  ): Effect.Effect<void, Error, never>;
}

interface RecorderOptions {
  signal?: AbortSignal;
  progressIntervalMs?: number;
  metadata?: StreamMetadata;
}

function record<K>(
  source: Stream.Stream<Uint8Array, Error, never>,
  sink: Sink<K>,
  sinkOptions?: K,
  options?: RecorderOptions,
): Stream.Stream<ProgressMetrics, Error, never>;

interface ProgressMetrics {
  bytes: number;
  elapsedMs: number;
  bitrateKbps: number;
  chunkCount: number;
  metadata?: StreamMetadata;
}

interface Resolver<T = unknown> {
  readonly platform: string;
  canHandle(url: string): boolean;
  resolve(url: string, options?: T): Effect.Effect<ResolvedStream, Error, never>;
}
```

## Layout

```
packages/
  core/               # @stream-fetcher/core
    src/
      types.ts
      errors/
        base.ts       # StreamFetcherError abstract base
        http.ts       # HTTP source errors
        hls.ts        # HLS source errors
      recorder.ts
      sources/http.ts
      sources/hls.ts
      sinks/file.ts
      sinks/stdout.ts
      sinks/s3.ts
      utils/s3_sign.ts
      adapters/bun.ts
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
  waitForLive(source: Source, options: DetectorOptions): Stream.Stream<Uint8Array, Error, never>;
}
```

## Platform Support

A `Resolver<T>` converts a user-facing platform URL into a `Source`.

Implementation order: Bilibili ✅ → Huya ✅. YouTube / Twitch on hold.

The library is designed for microservices / Kubernetes, not an end-user CLI.

## Authentication

Most platforms work anonymously, but some streams or higher-quality variants
require authentication. Auth is **platform-specific** and passed through each
resolver's options object. Core stays auth-agnostic.

- **Bilibili**
  - Accept an optional `cookie` string (sent as the `Cookie` header).
  - Accept an optional `cookieFile` path; load cookies from biliup's
    `cookie_info.cookies` JSON format.
  - Implement WBI signing for authenticated/private endpoints (e.g.
    `getInfoByRoom`, `getRoomPlayInfo`). The existing unsigned `playUrl`
    endpoint remains the default fallback.
- **Huya**
  - No user-facing authentication required; the anti-code algorithm is handled
    internally.
- **Future platforms (Twitch, YouTube, Douyu, etc.)**
  - Add token / cookie / session fields to their resolver options as needed.
  - Avoid a generic auth abstraction until a real cross-platform pattern
    emerges.

## Milestones

| M   | Deliverable                                            | Status  |
| --- | ------------------------------------------------------ | ------- |
| M1  | Core: interfaces, `HttpSource`, `FileSink`, `record()` | ✅ Done |
| M2  | `S3Sink`, graceful abort and single-sink `record()`    | ✅ Done |
| M3  | Workspace migration + Bilibili + Huya resolvers        | ✅ Done |
| M4  | README + Effect integration + adapter helpers          | ✅ Done |
| M5  | Extract platform strings to dedicated `messages.ts`    | ✅ Done |
| M6  | Remove Promise-based APIs, adopt Effect-TS only        | ✅ Done |
| M7  | Abstract `StreamFetcherError` base class               | ✅ Done |
| M8  | Authentication support (Bilibili cookie + WBI signing) | Planned |
