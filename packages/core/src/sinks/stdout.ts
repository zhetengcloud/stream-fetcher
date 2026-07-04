import type { Sink } from "@stream-fetcher/core/types";
import { Observable } from "rxjs";

/** Writes the Observable's chunks to Deno's stdout. */
export class StdoutSink implements Sink<undefined> {
  readonly name = "stdout";

  write(source$: Observable<Uint8Array>): Observable<void> {
    return new Observable<void>((subscriber) => {
      const writer = Deno.stdout.writable.getWriter();
      const subscription = source$.subscribe({
        next: (chunk) => writer.write(chunk),
        error: (err) => {
          writer.abort(err).catch(() => {});
          subscriber.error(err);
        },
        complete: () => {
          writer.releaseLock();
          subscriber.complete();
        },
      });
      subscriber.add(() => subscription.unsubscribe());
    });
  }
}
