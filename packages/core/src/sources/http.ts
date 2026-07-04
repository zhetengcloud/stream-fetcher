import { Observable } from "rxjs";
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
    return new Observable<Uint8Array>((subscriber) => {
      const controller = new AbortController();

      if (options.signal) {
        if (options.signal.aborted) {
          controller.abort();
        } else {
          options.signal.addEventListener("abort", () => controller.abort());
        }
      }

      fetch(options.url, {
        headers: options.headers,
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(
              `HTTP ${response.status}: ${response.statusText}`,
            );
          }
          if (!response.body) {
            throw new Error("Response body is null");
          }

          const reader = response.body.getReader();

          const pump = (): Promise<void> =>
            reader.read().then((result) => {
              if (subscriber.closed) return;
              if (result.done) {
                subscriber.complete();
                return;
              }
              subscriber.next(result.value);
              return pump();
            });

          return pump().catch((err) => subscriber.error(err));
        })
        .catch((err) => subscriber.error(err));

      return () => {
        controller.abort();
      };
    });
  }
}
