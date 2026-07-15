import { Data } from "effect";

type HttpRequestErrorPayload = {
  readonly status: number;
  readonly statusText: string;
};

export class HttpRequestError extends Data.TaggedError(
  "HttpRequestError",
)<HttpRequestErrorPayload> {}

export class HttpResponseBodyError extends Data.TaggedError("HttpResponseBodyError") {}

type HttpStreamErrorPayload = {
  readonly cause: unknown;
};

export class HttpStreamError extends Data.TaggedError("HttpStreamError")<HttpStreamErrorPayload> {}

export type HttpSourceError = HttpRequestError | HttpResponseBodyError | HttpStreamError;
