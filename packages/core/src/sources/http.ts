import { from, Observable, of, switchMap } from "rxjs";
import type { Source } from "@stream-fetcher/core/types";

/** Options for the generic HTTP(S) source. */
export interface HttpSourceOptions {
  url: string | URL;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Fetches a raw HTTP(S) stream and exposes it as a Source. */
export class HttpSource implements Source<HttpSourceOptions> {
  readonly name = "http";

  open(options: HttpSourceOptions): Observable<Uint8Array> {
    return from(
      fetch(options.url, {
        headers: options.headers,
        signal: options.signal,
      }),
    ).pipe(
      switchMap((response) => body$(response)),
      switchMap((reader) => chunks$(reader)),
    );
  }
}

function body$(
  response: Response,
): Observable<ReadableStreamDefaultReader<Uint8Array>> {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error("Response body is null");
  }
  return of(response.body.getReader());
}

function chunks$(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Observable<Uint8Array> {
  return new Observable<Uint8Array>((subscriber) => {
    const read = async () => {
      try {
        while (!subscriber.closed) {
          const result = await reader.read();
          if (result.done) {
            subscriber.complete();
            return;
          }
          subscriber.next(result.value);
        }
      } catch (err) {
        subscriber.error(err);
      }
    };

    read();
    return () => reader.releaseLock();
  });
}
