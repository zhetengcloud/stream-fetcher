import { Effect, Fiber, Stream } from "effect";
import type {
  EffectSink,
  Sink,
  StreamMetadata,
} from "@stream-fetcher/core/types";
import { toEffectSink } from "@stream-fetcher/core/adapters/effect";

/** Options for {@link record} and {@link recordEffect}. */
export interface RecorderOptions {
  /** AbortSignal for stopping the recording. */
  signal?: AbortSignal;
  /** Progress emit interval in milliseconds. Defaults to 1000. */
  progressIntervalMs?: number;
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

/**
 * Record a byte stream by piping it into a Sink.
 *
 * The returned ReadableStream emits {@link ProgressMetrics} at
 * `progressIntervalMs` cadence (default 1000ms), including an initial emit, and
 * closes when the sink finishes writing. Errors from the source stream or sink
 * error the progress stream. Cancelling the ReadableStream stops the recording.
 */
export function record<K = unknown>(
  source: ReadableStream<Uint8Array>,
  sink: Sink<K>,
  sinkOptions?: K,
  options: RecorderOptions = {},
): ReadableStream<ProgressMetrics> {
  const source$ = Stream.fromReadableStream<Uint8Array, Error>(
    () => source,
    (err: unknown) => err instanceof Error ? err : new Error(String(err)),
  );
  const progress$ = recordEffect(
    source$,
    toEffectSink(sink),
    sinkOptions,
    options,
  );
  return Effect.runSync(Stream.toReadableStreamEffect(progress$));
}

/**
 * Effect-based recorder. Returns a stream of {@link ProgressMetrics} while
 * piping the source into the sink.
 */
export function recordEffect<K = unknown>(
  source: Stream.Stream<Uint8Array, Error, never>,
  sink: EffectSink<K>,
  sinkOptions?: K,
  options: RecorderOptions = {},
): Stream.Stream<ProgressMetrics, Error, never> {
  return Stream.asyncEffect((emit) =>
    Effect.gen(function* () {
      const startTime = performance.now();
      const intervalMs = options.progressIntervalMs ?? 1000;
      let bytes = 0;
      let chunkCount = 0;
      let completed = false;
      const signal = options.signal;

      if (signal?.aborted) {
        yield* Effect.promise(() => emit.end());
        return Effect.void;
      }

      const emitProgress = () => {
        const elapsedMs = performance.now() - startTime;
        return Effect.promise(() =>
          emit.single({
            bytes,
            elapsedMs,
            bitrateKbps: elapsedMs > 0 ? (bytes * 8) / elapsedMs : 0,
            chunkCount,
            metadata: options.metadata,
          })
        );
      };

      const countedSource = source.pipe(
        Stream.interruptWhen(abortEffect(signal)),
        Stream.tap((chunk: Uint8Array) =>
          Effect.sync(() => {
            bytes += chunk.length;
            chunkCount++;
          })
        ),
      );

      yield* emitProgress();

      const sinkFiber = yield* Effect.fork(
        sink.write(countedSource, sinkOptions),
      );

      const progressFiber = yield* Effect.fork(
        Effect.gen(function* () {
          while (true) {
            yield* Effect.sleep(intervalMs);
            yield* emitProgress();
          }
        }),
      );

      yield* Effect.fork(
        Fiber.join(sinkFiber).pipe(
          Effect.matchEffect({
            onFailure: (err) =>
              Effect.gen(function* () {
                yield* Fiber.interrupt(progressFiber);
                if (!completed) {
                  completed = true;
                  yield* Effect.promise(() => emit.fail(err));
                }
              }),
            onSuccess: () =>
              Effect.gen(function* () {
                yield* Fiber.interrupt(progressFiber);
                if (!completed) {
                  completed = true;
                  yield* Effect.promise(() => emit.end());
                }
              }),
          }),
        ),
      );

      return Effect.sync(() => {
        if (!completed) {
          completed = true;
          Effect.runFork(Fiber.interrupt(sinkFiber));
          Effect.runFork(Fiber.interrupt(progressFiber));
        }
      });
    })
  );
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
