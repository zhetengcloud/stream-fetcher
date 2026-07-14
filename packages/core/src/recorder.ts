import { Effect, Stream } from "effect";
import type { Sink, StreamMetadata } from "@stream-fetcher/core/types";

/** Options for {@link record}. */
export interface RecorderOptions {
  /** AbortSignal for stopping the recording. */
  signal?: AbortSignal;
  /** Optional metadata describing the stream (e.g. from a Resolver). */
  metadata?: StreamMetadata;
}

/** Throughput/health metrics emitted by the recorder. */
export interface ProgressMetrics {
  bytes: number;
  elapsedMs: number;
  bitrateKbps: number;
  chunkCount: number;
  metadata?: StreamMetadata;
}

/** Byte/chunk counters at a point in time. */
interface MetricsState {
  readonly bytes: number;
  readonly chunkCount: number;
}

/**
 * Effect-based recorder. Returns a stream of {@link ProgressMetrics} while
 * piping the source into the sink.
 */
export function record<E = Error, K = unknown>(
  source: Stream.Stream<Uint8Array, E, never>,
  sink: Sink<E, K>,
  sinkOptions?: K,
  options: RecorderOptions = {},
): Stream.Stream<ProgressMetrics, E, never> {
  return Stream.unwrapScoped(
    Effect.gen(function* () {
      const signal = options.signal;
      const shared = yield* Stream.share(source, { capacity: "unbounded" });
      const startTime = performance.now();

      const counted = abortableStream(shared, signal);
      const sinkWork = writeToSink(counted, sink, sinkOptions);
      const progress = progressStream(shared, startTime, options.metadata);

      return Stream.merge(progress, sinkWork, { haltStrategy: "either" }).pipe(
        Stream.interruptWhen(abortEffect(signal)),
      );
    }),
  );
}

/**
 * Writes a source stream into a sink and returns an empty stream that fails
 * when the sink fails.
 */
function writeToSink<E, K>(
  source: Stream.Stream<Uint8Array, E, never>,
  sink: Sink<E, K>,
  sinkOptions?: K,
): Stream.Stream<never, E, never> {
  return Stream.drain(Stream.fromEffect(sink.write(source, sinkOptions)));
}

/**
 * Derives a progress stream from a source stream.
 *
 * Emits an initial snapshot before any chunks, then one snapshot after each
 * chunk.
 */
function progressStream<E>(
  source: Stream.Stream<Uint8Array, E, never>,
  startTime: number,
  metadata?: StreamMetadata,
): Stream.Stream<ProgressMetrics, E, never> {
  return source.pipe(
    Stream.scan({ bytes: 0, chunkCount: 0 }, (state, chunk) => ({
      bytes: state.bytes + chunk.length,
      chunkCount: state.chunkCount + 1,
    })),
    Stream.map((state) => buildProgressMetrics(state, startTime, metadata)),
  );
}

/** Builds a progress snapshot from the current metrics state. */
function buildProgressMetrics(
  state: MetricsState,
  startTime: number,
  metadata?: StreamMetadata,
): ProgressMetrics {
  const elapsedMs = performance.now() - startTime;
  return {
    bytes: state.bytes,
    elapsedMs,
    bitrateKbps: elapsedMs > 0 ? (state.bytes * 8) / elapsedMs : 0,
    chunkCount: state.chunkCount,
    metadata,
  };
}

/**
 * Makes any stream abortable. If the signal is already aborted, returns an
 * empty stream; otherwise the stream is interrupted when the signal fires.
 */
function abortableStream<A, E, R>(
  source: Stream.Stream<A, E, R>,
  signal: AbortSignal | undefined,
): Stream.Stream<A, E, R> {
  if (signal?.aborted) return Stream.empty;
  return source.pipe(Stream.interruptWhen(abortEffect(signal)));
}

function abortEffect(
  signal: AbortSignal | undefined,
): Effect.Effect<void, never, never> {
  if (!signal) return Effect.never;
  if (signal.aborted) return Effect.void;
  return Effect.async<void>((resume) => {
    const handler = () => resume(Effect.void);
    signal.addEventListener("abort", handler, { once: true });
    return Effect.sync(() => signal.removeEventListener("abort", handler));
  });
}
