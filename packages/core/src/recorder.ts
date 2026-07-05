import type { Sink, StreamMetadata } from "@stream-fetcher/core/types";
import {
  defer,
  EMPTY,
  endWith,
  ignoreElements,
  interval,
  map,
  merge,
  Observable,
  scan,
  share,
  startWith,
  takeUntil,
  withLatestFrom,
} from "rxjs";

/** Convert an AbortSignal into a one-shot Observable. */
function abortSignal$(signal?: AbortSignal): Observable<void> {
  if (!signal) return EMPTY;
  return new Observable<void>((subscriber) => {
    if (signal.aborted) {
      subscriber.next();
      subscriber.complete();
      return;
    }
    const handler = () => {
      subscriber.next();
      subscriber.complete();
    };
    signal.addEventListener("abort", handler, { once: true });
    return () => signal.removeEventListener("abort", handler);
  });
}

/** Options for {@link record}. */
export interface RecorderOptions {
  /** AbortSignal for stopping the recording. */
  signal?: AbortSignal;
  /** Progress emit interval in milliseconds. Defaults to 1000. */
  progressIntervalMs?: number;
  /** Optional metadata describing the stream (e.g. from a Resolver). */
  metadata?: StreamMetadata;
}

/** Records a byte stream into a Sink. */
export interface Recorder {
  readonly name: string;
  /**
   * Pipe `source$` into `sink` and emit progress metrics until the sink
   * finalizes. Errors from either stream propagate to the subscriber.
   * Unsubscribing or aborting `signal` stops the recording.
   */
  record<K = unknown>(
    source$: Observable<Uint8Array>,
    sink: Sink<K>,
    sinkOptions?: K,
    options?: RecorderOptions,
  ): Observable<ProgressMetrics>;
}

/** Throughput/health metrics emitted by {@link record}. */
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
 * The returned Observable is cold: each subscription writes to the sink anew. It
 * emits {@link ProgressMetrics} at `progressIntervalMs` cadence (default 1000ms),
 * including an initial emit, and completes when the sink finishes writing.
 * Errors from the source stream or sink propagate to the subscriber.
 * Unsubscribing or aborting the `AbortSignal` stops the recording.
 */
export function record<K = unknown>(
  source$: Observable<Uint8Array>,
  sink: Sink<K>,
  sinkOptions?: K,
  options: RecorderOptions = {},
): Observable<ProgressMetrics> {
  return defer(() => {
    const startTime = performance.now();
    const abort$ = abortSignal$(options.signal);

    const sharedSource$ = source$.pipe(
      takeUntil(abort$),
      share(),
    );

    const bytes$ = sharedSource$.pipe(
      map((chunk) => chunk.length),
      scan((acc, len) => acc + len, 0),
      startWith(0),
    );

    const chunkCount$ = sharedSource$.pipe(
      scan((acc) => acc + 1, 0),
      startWith(0),
    );

    const sink$ = sink.write(sharedSource$, sinkOptions).pipe(
      takeUntil(abort$),
    );

    const progress$ = interval(options.progressIntervalMs ?? 1000).pipe(
      startWith(0),
      takeUntil(abort$),
      takeUntil(sink$.pipe(ignoreElements(), endWith(null))),
      withLatestFrom(bytes$, chunkCount$),
      map(([_, bytes, chunkCount]) => {
        const elapsedMs = performance.now() - startTime;
        return {
          bytes,
          elapsedMs,
          bitrateKbps: elapsedMs > 0 ? (bytes * 8) / elapsedMs : 0,
          chunkCount,
          metadata: options.metadata,
        };
      }),
    );

    return merge(progress$, sink$.pipe(ignoreElements()));
  });
}
