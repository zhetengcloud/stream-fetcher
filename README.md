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
body as a byte stream. `HlsSource` fetches an `.m3u8` playlist, parses out the
segment URLs, and emits the concatenated bytes of each segment in order.

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

### FLV vs HLS

Both protocols are resolved into a single byte stream:

- **FLV**: the platform returns one long-lived `.flv` URL. `HttpSource` opens it
  and emits chunks as they arrive. `record()` writes those chunks straight into
  the sink, so a file sink produces one continuous `.flv` file.

- **HLS**: the platform returns an `.m3u8` playlist. `HlsSource` repeatedly
  refreshes the playlist (for live streams), fetches each new `.ts` segment, and
  emits their bytes in playlist order. `record()` sees the same
  `Observable<Uint8Array>` as FLV, so a file sink also produces one continuous
  file — but the bytes are MPEG-TS transport-stream segments concatenated
  back-to-back, not a standalone `.mp4`.

Because the bytes are the platform's native container, saving them directly
usually means saving `.flv` or `.ts` files. If downstream tools need `.mp4`,
remux them in a separate step (e.g. with FFmpeg) after (or while) fetching. The
library intentionally stays out of video decoding/remuxing so it can remain
runtime-agnostic and small.

### Usage

```ts
import { record } from "@stream-fetcher/core";

const subscription = record(
  source$, // Observable<Uint8Array>
  sink, // Sink
  sinkOptions, // sink-specific options
  { progressIntervalMs: 1000 },
).subscribe({
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
record(source$, sink, sinkOptions, { signal: controller.signal }).subscribe({
  next: (metrics) => console.log(metrics),
  error: (err) => console.error(err),
});
controller.abort(); // stops recording
```

### Saving to files

Use `FileSink` with the Deno file-system adapter to write the raw stream to a
file. Choose the extension to match the source format:

```ts
import { FileSink } from "@stream-fetcher/core";
import { createDenoFileSystem } from "@stream-fetcher/core/adapters/deno";

const fs = createDenoFileSystem();

record(
  source$, // e.g. from HttpSource.open() or HlsSource.open()
  new FileSink(), // sink
  { path: "./stream.flv", fs }, // sink options
).subscribe();
```

For HLS this writes a single concatenated `.ts` file, not an `.mp4`. Remux to
`.mp4` afterwards if needed:

```sh
ffmpeg -i stream.ts -c copy stream.mp4
```

If the live stream had encoder resets or timestamp discontinuities, FFmpeg may
need generated timestamps:

```sh
ffmpeg -fflags +genpts -i stream.ts -c copy stream.mp4
```

### Why only one sink?

`record()` intentionally fans out to **one** destination. If you need the bytes
in multiple places, write to a multiplexing system such as Kafka, NATS,
Redpanda, or a similar message bus, and let it handle replication, routing, and
consumer fan-out. This keeps the core simple and avoids backpressure and
partial-failure complexity inside the library.

## License

MIT
