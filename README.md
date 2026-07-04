# stream-fetcher

A minimal Deno/TS library for fetching live streams and piping them to file,
S3/OSS, stdout, or other sinks.

Inspired by [Streamlink](https://github.com/streamlink/streamlink) and
[biliup](https://github.com/biliup/biliup).

## Goal

Provide a small, composable core for live stream recording in server-side /
microservice / Kubernetes environments. No CLI, no UI — just sources, sinks, and
a `record()` function.

## Status

Early design phase. See [`PLAN.md`](./PLAN.md) for architecture and milestones.

## How It Works

The library is built around three small abstractions:

- `Source` — produces an `Observable<Uint8Array>` of the live stream's raw bytes
  (FLV, HLS transport stream, etc.). It does not decode video or audio.
- `Sink` — consumes an `Observable<Uint8Array>` and writes it somewhere (file,
  S3/OSS, stdout, a message bus, etc.).
- `record()` — wires one `Source` to one `Sink` and pumps the raw bytes through.

### Fetching and piping

```
room URL -> Resolver -> stream URL -> Source -> record() -> Sink -> destination
```

A `Resolver` turns a platform-specific URL (e.g.
`https://live.bilibili.com/12345`) into a `Source`. It does this by parsing the
room page or calling the platform API to extract the real stream URL — for
example an `.flv` endpoint for FLV, or an `.m3u8` playlist for HLS — and
attaching the headers (referer, user-agent, cookies) the CDN expects.

`HttpSource` is the generic implementation that fetches that URL and exposes its
body as a byte stream.

`record()` then:

1. Opens the source stream.
2. Opens the sink's writable stream.
3. Reads raw byte chunks from the source and writes each chunk into the sink.
4. Emits `ProgressMetrics` (bytes, elapsed time, chunk count, bitrate) at
   `progressIntervalMs` cadence.
5. Closes the sink and source when the stream ends, an error occurs, the
   subscription is unsubscribed, or an `AbortSignal` fires.

The bytes flowing through are the platform's native live stream bytes (FLV or
HLS transport-stream segments). The library is a pipe, not a media parser or
demuxer.

### Usage

```ts
import { record } from "@stream-fetcher/core";

const subscription = record({
  source,
  sink,
  progressIntervalMs: 1000,
}).subscribe({
  next: (metrics) => {
    console.log(
      `${metrics.bytes} bytes, ${metrics.bitrateKbps.toFixed(1)} kbps`,
    );
  },
  error: (err) => console.error("Recording failed", err),
  complete: () => console.log("Recording finished"),
});

// Stop at any time:
setTimeout(() => subscription.unsubscribe(), 30000);
```

You can also pass an `AbortSignal` to stop the recording externally:

```ts
const controller = new AbortController();
record({ source, sink, signal: controller.signal }).subscribe({
  next: (metrics) => console.log(metrics),
  error: (err) => console.error(err),
});
controller.abort(); // stops recording
```

### Why only one sink?

`record()` intentionally fans out to **one** destination. If you need the bytes
in multiple places, write to a multiplexing system such as Kafka, NATS,
Redpanda, or a similar message bus, and let it handle replication, routing, and
consumer fan-out. This keeps the core simple and avoids backpressure and
partial-failure complexity inside the library.

## License

MIT
