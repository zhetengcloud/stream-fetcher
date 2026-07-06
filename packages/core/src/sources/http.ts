import { Effect, Stream } from "effect";
import type { EffectSource, Source } from "@stream-fetcher/core/types";
import { messages } from "@stream-fetcher/core/messages";

/** Options for the generic HTTP(S) source. */
export interface HttpSourceOptions {
  url: string | URL;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Fetches a raw HTTP(S) stream and exposes it as an EffectSource. */
export class HttpEffectSource implements EffectSource<HttpSourceOptions> {
  readonly name = "http";

  open(options: HttpSourceOptions): Stream.Stream<Uint8Array, Error, never> {
    return fetchResponse(options).pipe(
      Stream.flatMap((response) =>
        Stream.fromReadableStream(
          () => response,
          (err) => err instanceof Error ? err : new Error(String(err)),
        )
      ),
    );
  }
}

/** Fetches a raw HTTP(S) stream and exposes it as a Source. */
export class HttpSource implements Source<HttpSourceOptions> {
  readonly name = "http";
  readonly #effectSource = new HttpEffectSource();

  open(options: HttpSourceOptions): Promise<ReadableStream<Uint8Array>> {
    return Effect.runPromise(
      Stream.toReadableStreamEffect(this.#effectSource.open(options)),
    );
  }
}

function fetchResponse(
  options: HttpSourceOptions,
): Stream.Stream<ReadableStream<Uint8Array>, Error, never> {
  return Stream.fromEffect(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(options.url, {
          headers: options.headers,
          signal: options.signal,
        });
        if (!response.ok) {
          throw new Error(
            `${messages.errors.httpRequestFailed}: ${response.status} ${response.statusText}`,
          );
        }
        if (!response.body) {
          throw new Error(messages.errors.responseBodyIsNull);
        }
        return response.body;
      },
      catch: (err: unknown) =>
        err instanceof Error ? err : new Error(String(err)),
    }),
  );
}
