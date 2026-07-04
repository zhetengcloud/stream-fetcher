import type { FileSystem } from "@stream-fetcher/core/types";
import { defer, Observable } from "rxjs";

/** Creates a FileSystem adapter backed by Deno APIs. */
export function createDenoFileSystem(): FileSystem {
  return {
    write(
      path: string,
      source$: Observable<Uint8Array>,
    ): Observable<void> {
      return new Observable<void>((subscriber) => {
        let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
        let subscription: { unsubscribe(): void } | null = null;

        Deno.open(path, {
          write: true,
          create: true,
          truncate: true,
        }).then((file) => {
          if (subscriber.closed) {
            file.close();
            return;
          }
          writer = file.writable.getWriter();
          subscription = source$.subscribe({
            next: (chunk) => writer?.write(chunk),
            error: (err) => {
              writer?.abort(err).catch(() => {});
              subscriber.error(err);
            },
            complete: () => {
              writer?.close().catch(() => {});
              subscriber.complete();
            },
          });
        }).catch((err) => subscriber.error(err));

        subscriber.add(() => {
          subscription?.unsubscribe();
          writer?.abort().catch(() => {});
        });
      });
    },
    mkdir(dir: string): Observable<void> {
      return defer(() => Deno.mkdir(dir, { recursive: true }));
    },
  };
}
