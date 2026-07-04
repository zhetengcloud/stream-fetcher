import type { Observable, Subscription } from "rxjs";

/**
 * Adapts an RxJS Observable into a Web Streams ReadableStream.
 *
 * Backpressure is not enforced; values are enqueued as fast as the Observable
 * produces them. Use this for cases where the Observable itself already models
 * the desired production rate (e.g., polled HLS segment fetching).
 */
export function readableStreamFromObservable<T>(
  observable: Observable<T>,
): ReadableStream<T> {
  let subscription: Subscription;

  return new ReadableStream<T>({
    start(controller) {
      subscription = observable.subscribe({
        next: (value) => controller.enqueue(value),
        error: (err) => controller.error(err),
        complete: () => controller.close(),
      });
    },
    cancel() {
      subscription.unsubscribe();
    },
  });
}
