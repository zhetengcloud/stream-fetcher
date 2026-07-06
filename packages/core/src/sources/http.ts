import { Effect, Stream } from "effect";
import type { EffectSource, Source } from "@stream-fetcher/core/types";
import { messages } from "@stream-fetcher/core/messages";

/** Options for the generic HTTP(S) source. */
export interface HttpSourceOptions {
  url: string | URL;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Fetches a raw HTTP(S) stream and exposes it as a Source. */
export class HttpSource implements Source<HttpSourceOptions> {
  readonly name = "http";

  async open(options: HttpSourceOptions): Promise<ReadableStream<Uint8Array>> {
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
  }
}

/** Effect-based HTTP(S) source. */
export class HttpEffectSource implements EffectSource<HttpSourceOptions> {
  readonly name = "http";

  open(options: HttpSourceOptions): Stream.Stream<Uint8Array, Error, never> {
    return Stream.fromEffect(
      Effect.tryPromise<ReadableStream<Uint8Array>, Error>({
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
          return response.body as ReadableStream<Uint8Array>;
        },
        catch: (err: unknown) =>
          err instanceof Error ? err : new Error(String(err)),
      }),
    ).pipe(
      Stream.flatMap((readable: ReadableStream<Uint8Array>) =>
        Stream.fromReadableStream(
          () => readable,
          (err: unknown) => err instanceof Error ? err : new Error(String(err)),
        )
      ),
    );
  }
}
