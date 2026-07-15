import { Effect, Match, Stream } from "effect";
import type { Source } from "@stream-fetcher/core/types";
import {
  HttpRequestError,
  HttpResponseBodyError,
  type HttpSourceError,
  HttpStreamError,
} from "@stream-fetcher/core/errors/http";

export {
  HttpRequestError,
  HttpResponseBodyError,
  HttpStreamError,
} from "@stream-fetcher/core/errors/http";
export type { HttpSourceError } from "@stream-fetcher/core/errors/http";

/** Options for the generic HTTP(S) source. */
export interface HttpSourceOptions {
  url: string | URL;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Fetches a raw HTTP(S) stream and exposes it as a Source. */
export class HttpSource implements Source<HttpSourceError, HttpSourceOptions> {
  readonly name = "http";

  open(options: HttpSourceOptions): Stream.Stream<Uint8Array, HttpSourceError, never> {
    return Stream.fromEffect(fetchResponse(options)).pipe(
      Stream.flatMap((response) =>
        Stream.fromReadableStream(
          () => response,
          (err) => new HttpStreamError({ cause: err }),
        ),
      ),
    );
  }
}

type FetchResponseEffect = Effect.Effect<ReadableStream<Uint8Array>, HttpSourceError, never>;

function fetchResponse(options: HttpSourceOptions): FetchResponseEffect {
  return Effect.tryPromise({
    try: () =>
      fetch(options.url, {
        headers: options.headers,
        signal: options.signal,
      }),
    catch: (err: unknown): HttpSourceError =>
      new HttpRequestError({ status: 0, statusText: String(err) }),
  }).pipe(Effect.flatMap(handleResponse));
}

function handleResponse(response: Response): FetchResponseEffect {
  return Match.value(response).pipe(
    Match.withReturnType<FetchResponseEffect>(),
    Match.when({ ok: true, body: Match.defined }, (res) => Effect.succeed(res.body)),
    Match.when({ ok: true }, () => Effect.fail(new HttpResponseBodyError())),
    Match.orElse((res) =>
      Effect.fail(
        new HttpRequestError({
          status: res.status,
          statusText: res.statusText,
        }),
      ),
    ),
  );
}
