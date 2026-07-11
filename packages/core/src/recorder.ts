import { Effect, Fiber, Stream } from "effect";
import type { Sink, StreamMetadata } from "@stream-fetcher/core/types";

/** Options for {@link record}. */
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
 * Effect-based recorder. Returns a stream of {@link ProgressMetrics} while
 * piping the source into the sink.
 */
export function record<K = unknown>(
  source: Stream.Stream<Uint8Array, Error, never>,
  sink: Sink<K>,
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
