# Stream Fetcher / Saver — Design Plan

> First edition: a small Deno/TS library that fetches a live stream and pipes it to one or more outputs (file, S3, OSS, stdout, etc.).
> Inspired by `streamlink` / `biliup`, but intentionally minimal: no UI, no plugin ecosystem yet, no complex retry policy.

## 1. Goal & Scope

### In scope (v0.1)
- Fetch an HTTP(S) live stream (e.g. HLS `.m3u8`, plain progressive HTTP, chunked transfer).
- Write the raw bytes to configurable outputs.
- Built-in outputs: local file, stdout, S3-compatible object storage.
- Simple `Recorder` abstraction that owns a `Source` and one or more `Sink`s.
- Abort / stop gracefully.
- Typed public API exported from `mod.ts`.

### Out of scope (v0.1)
- Stream protocol parsers beyond basic HTTP fetching (no DASH manifest parser, no RTMP).
- Streamlink-like plugin system.
- Recording scheduler / daemon mode.
- Complex resume/segment merging logic.
- UI or CLI.

## 2. Core Abstractions

```
Source  ->  Transform?  ->  Sink(s)
   |                           |
   +-- Reader / Stream         +-- FileSink
                               +-- S3Sink
                               +-- StdoutSink
                               +-- CustomSink
```

### 2.1 `Source<T>`
Responsible for connecting to a stream and producing a `ReadableStream<Uint8Array>`.

```ts
interface Source<T = unknown> {
  readonly name: string;
  open(options?: T): Promise<ReadableStream<Uint8Array>>;
  close?(): Promise<void>;
}
```

- `HttpSource`: generic HTTP(S) GET with `fetch`, supports headers & abort signal.
- `HlsSource` (later): parses `.m3u8`, fetches media segments sequentially.

### 2.2 `Sink<T>`
Responsible for consuming chunks and writing them somewhere.

```ts
interface Sink<T = unknown> {
  readonly name: string;
  open(options?: T): Promise<WritableStream<Uint8Array>>;
  close?(): Promise<void>;
}
```

Built-ins:
- `FileSink`
- `StdoutSink`
- `S3Sink` / `OSSSink` — S3-compatible via AWS Signature V4, upload via multipart or single PUT.

### 2.3 `Recorder`
Orchestrates one `Source` → N `Sink`s.

```ts
interface RecorderOptions<S, K> {
  source: Source<S>;
  sourceOptions?: S;
  sinks: Array<Sink<K>>;
  sinkOptions?: K[];
  signal?: AbortSignal;
  onError?: (error: unknown, ctx: { source?: string; sink?: string }) => void;
  /** Emitted periodically while recording. For live streams this is throughput,
   *  not completion percentage (no total length is known). */
  onProgress?: (metrics: { bytes: number; elapsedMs: number; bitrateKbps: number; chunkCount: number }) => void;
}

class Recorder {
  constructor(options: RecorderOptions);
  start(): Promise<void>;
  stop(): Promise<void>;
  get status(): "idle" | "running" | "stopped" | "error";
}
```

## 3. Module Layout

```
stream-fetcher/
├── deno.json           # Deno config
├── deno.lock
├── mod.ts              # Public API exports
├── PLAN.md             # This file
├── README.md           # Usage docs (later)
├── src/
│   ├── types.ts        # Core interfaces (Source, Sink, RecorderOptions, ...)
│   ├── recorder.ts     # Recorder implementation
│   ├── sources/
│   │   ├── http.ts
│   │   └── mod.ts
│   ├── sinks/
│   │   ├── file.ts
│   │   ├── stdout.ts
│   │   ├── s3.ts       # S3-compatible / OSS / MinIO
│   │   └── mod.ts
│   └── utils/
│       ├── streams.ts  # Tee, meter, throttle helpers
│       └── s3_sign.ts  # AWS Signature V4 for S3
└── tests/
    ├── recorder_test.ts
    ├── sources_test.ts
    └── sinks_test.ts
```

## 4. Data Flow

1. `Recorder.start()` calls `source.open()` → returns `ReadableStream`.
2. For each sink, call `sink.open()` → returns `WritableStream`.
3. Optionally wrap the source reader with a `ProgressTransformStream` to count bytes.
4. If N sinks > 1, use `ReadableStream.tee()` or a custom broadcast transform to fan-out.
5. `await Promise.all(reader.pipeTo(writer))` for every sink.
6. On abort signal or `stop()`: abort the source fetch, close all sinks.

```
fetch(url) ──► tee ──► writer A (file)
              │
              └──────► writer B (S3 multipart)
```

## 5. Extension Points

- New protocols: implement `Source<T>`.
- New storage backends: implement `Sink<T>`.
- Middleware / transforms: insert `TransformStream<Uint8Array, Uint8Array>` between source and sinks.

Future ideas (not v0.1):
- `HlsSource` with segment retry and playlist reload.
- `SegmentedFileSink` rotating files by size or time.
- `MetricsSink` exposing Prometheus-style counters.

## 6. Error & Lifecycle Strategy

- Source failure propagates to `Recorder.stop()` with error context.
- One sink failure should not silently kill others unless configured.
- Always close sinks in `finally` blocks.
- Respect `AbortSignal` from both user and internal timeout.

## 7. Milestones

| Milestone | Deliverable |
|-----------|-------------|
| M1 | `Source`, `Sink`, `Recorder` interfaces + `HttpSource` + `FileSink` |
| M2 | `S3Sink` with single PUT |
| M3 | Multi-sink tee support + progress callback |
| M4 | Abort / graceful stop + basic tests |
| M5 | README + example scripts |

## 8. Design Principles

- **Interface first**: all concrete implementations depend on `Source`/`Sink`, not the other way around.
- **Web Streams everywhere**: use WHATWG `ReadableStream` / `WritableStream` / `TransformStream` for portability.
- **No external runtime deps in core**: built-ins use Deno native APIs (`fetch`, `Deno.open`, etc.). S3 signing may be hand-written or opt-in dependency.
- **Single responsibility**: source only reads, sink only writes, recorder only coordinates.


## 9. Supporting Streaming Platforms (Twitch / YouTube / Bilibili / Huya / Douyu)

### 9.1 Why this is different from a raw HTTP source

These platforms do not expose a stable direct stream URL you can `fetch()` forever. Instead:

- URLs are often **time-signed** or **session-signed** (expire after minutes).
- The real stream URL is hidden behind a page or an API that requires headers, cookies, or signatures.
- Some use proprietary protocols or obfuscated JavaScript (e.g. Douyu/Huya historically).
- Rate limiting, geo-blocking, and bot detection are common.

So we introduce a **platform resolver** layer that turns a user-facing URL or slug into a concrete `Source`.

### 9.2 New abstraction: `Resolver`

```ts
interface Resolver {
  readonly platform: string;
  /** Returns true if this resolver can handle the input URL/slug. */
  canHandle(url: string): boolean;
  /** Resolve the user input into a Source (e.g. an HLS URL + headers). */
  resolve(url: string, options?: ResolverOptions): Promise<Source<unknown>>;
}
```

A resolver is **not** a source. It is a factory that produces a `Source`. This keeps the core recorder untouched.

### 9.3 Platform support strategy

| Platform | Typical approach | Complexity |
|----------|------------------|------------|
| **Twitch** | Twitch API (`Get Stream Key`) or public GraphQL/gql endpoints for HLS `.m3u8`. Needs `Client-ID`. | Medium |
| **YouTube** | Extract `hlsManifestUrl` or `url_encoded_fmt_stream_map` from watch page / player API. Fragile. | High |
| **Bilibili** | Room page → API call → returns HLS/FLV URL. Relatively stable public endpoints. | Low-Medium |
| **Huya** | Room page → `stream` data embedded in HTML/JS → FLV/HLS URL. May change encoding. | Medium |
| **Douyu** | Historically obfuscated JS signing (`sign` parameter). Requires reverse engineering. | High |

Recommended v0.2 approach:
- Implement **Bilibili** first as the reference resolver (stable API, lowest friction).
- Add **Twitch** second using `https://usher.ttvnw.net/api/channel/hls/{channel}.m3u8` with required headers.
- Add **Huya** third.
- Treat **YouTube** and **Douyu** as opt-in/experimental due to fragility.

### 9.4 Where platform code lives

Use a **monorepo with Deno workspaces** so each platform resolver is an independent package, but the core library stays clean.

```
stream-fetcher/
├── deno.json                 # workspace root
├── deno.lock
├── PLAN.md
├── packages/
│   ├── core/                 # @stream-fetcher/core
│   │   ├── deno.json
│   │   ├── mod.ts
│   │   ├── src/types.ts
│   │   ├── src/recorder.ts
│   │   ├── src/sources/http.ts
│   │   ├── src/sinks/file.ts
│   │   ├── src/sinks/stdout.ts
│   │   └── src/sinks/s3.ts
│   ├── bilibili/             # @stream-fetcher/bilibili
│   │   ├── deno.json
│   │   ├── mod.ts
│   │   └── src/resolver.ts
│   ├── twitch/               # @stream-fetcher/twitch
│   ├── youtube/              # @stream-fetcher/youtube
│   ├── huya/                 # @stream-fetcher/huya
│   └── douyu/                # @stream-fetcher/douyu
└── tests/
    ├── integration_test.ts
    └── ...
```

Root `deno.json` workspace declaration:

```json
{
  "workspace": [
    "packages/core",
    "packages/bilibili",
    "packages/twitch",
    "packages/youtube",
    "packages/huya",
    "packages/douyu"
  ],
  "imports": {
    "@std/assert": "jsr:@std/assert@1"
  }
}
```

Each package declares its own `imports` and depends on `../core`:

```json
{
  "name": "@stream-fetcher/bilibili",
  "version": "0.1.0",
  "exports": "./mod.ts",
  "imports": {
    "@stream-fetcher/core": "../core/mod.ts"
  }
}
```

### 9.5 Why workspaces make sense here

1. **Independent versioning**: platform resolvers change at different rates (Bilibili stable, YouTube fragile).
2. **Clear dependencies**: core has no platform knowledge; each platform imports core, not vice versa.
3. **Opt-in installs**: users only pull in the resolvers they need.
4. **Testing isolation**: a broken YouTube resolver does not block core CI.
5. **Future runtime portability**: core can later target Node/Bun because it only uses Web Streams; platform packages may stay Deno-specific.

### 9.6 Resolver registry (optional)

Provide a tiny helper in core or a separate `packages/registry`:

```ts
import { Resolver } from "@stream-fetcher/core";
import { BilibiliResolver } from "@stream-fetcher/bilibili";
import { TwitchResolver } from "@stream-fetcher/twitch";

export const defaultResolvers: Resolver[] = [
  new BilibiliResolver(),
  new TwitchResolver(),
  // ...
];

export function resolve(url: string, resolvers = defaultResolvers): Promise<Source> {
  const resolver = resolvers.find((r) => r.canHandle(url));
  if (!resolver) throw new Error(`No resolver for ${url}`);
  return resolver.resolve(url);
}
```

### 9.7 CLI direction (post-v0.2)

A thin CLI can live in `apps/cli/` or a root `cli.ts`:

```bash
deno run cli.ts --input https://live.bilibili.com/12345 --output s3://bucket/key.ts
```

It uses the resolver registry to pick a source, then the core `Recorder` to pipe to sinks. The CLI is a separate concern from the library.

### 9.8 Updated milestones

| Milestone | Deliverable |
|-----------|-------------|
| M1 | Core `@stream-fetcher/core`: interfaces, `HttpSource`, `FileSink`, `Recorder` |
| M2 | `S3Sink` + multi-sink tee + abort |
| **M3** | Workspace migration + `@stream-fetcher/bilibili` resolver + `@stream-fetcher/huya` resolver |
| M4 | `@stream-fetcher/twitch` resolver |
| M5 | Experimental `@stream-fetcher/youtube` / `@stream-fetcher/douyu` |
| M6 | CLI + README examples |
