import type { RecorderOptions } from "@stream-fetcher/core/types";
import {
  defer,
  EMPTY,
  finalize,
  ignoreElements,
  interval,
  map,
  merge,
  Observable,
  startWith,
  Subject,
  takeUntil,
  tap,
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

/** Throughput/health metrics emitted by {@link record}. */
export interface ProgressMetrics {
  bytes: number;
  elapsedMs: number;
  bitrateKbps: number;
  chunkCount: number;
}

/**
 * Record a live stream by piping one Source into one Sink.
 *
 * The returned Observable is cold: each subscription opens the source and sink
 * anew. It emits {@link ProgressMetrics} at `progressIntervalMs` cadence
 * (default 1000ms), including an initial emit, and completes when the sink
 * finishes writing. Errors from the source or sink propagate to the subscriber.
 * Unsubscribing or aborting the `AbortSignal` stops the recording and finalizes
 * both sides.
 */
export function record<S = unknown, K = unknown>(
  options: RecorderOptions<S, K>,
): Observable<ProgressMetrics> {
  return defer(() => {
    const startTime = performance.now();
    let bytes = 0;
    let chunkCount = 0;

    const abort$ = abortSignal$(options.signal);
    const stopped$ = new Subject<void>();

    const source$ = options.source.open(options.sourceOptions).pipe(
      takeUntil(abort$),
      takeUntil(stopped$),
      tap((chunk) => {
        bytes += chunk.length;
        chunkCount += 1;
      }),
    );

    const sink$ = options.sink.write(source$, options.sinkOptions).pipe(
      finalize(() => {
        stopped$.next();
        stopped$.complete();
      }),
    );

    const intervalMs = options.progressIntervalMs ?? 1000;
    const progress$ = interval(intervalMs).pipe(
      takeUntil(stopped$),
      startWith(0),
      map(() => {
        const elapsedMs = performance.now() - startTime;
        return {
          bytes,
          elapsedMs,
          bitrateKbps: elapsedMs > 0 ? (bytes * 8) / elapsedMs : 0,
          chunkCount,
        };
      }),
    );

    return merge(progress$, sink$.pipe(ignoreElements()));
  });
}
