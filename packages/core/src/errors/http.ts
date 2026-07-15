export class HttpRequestError {
  readonly _tag: "HttpRequestError" = "HttpRequestError";
  readonly status: number;
  readonly statusText: string;
  constructor(payload: { status: number; statusText: string }) {
    this.status = payload.status;
    this.statusText = payload.statusText;
  }
}

export class HttpResponseBodyError {
  readonly _tag: "HttpResponseBodyError" = "HttpResponseBodyError";
}

export class HttpStreamError {
  readonly _tag: "HttpStreamError" = "HttpStreamError";
  readonly cause: unknown;
  constructor(payload: { cause: unknown }) {
    this.cause = payload.cause;
  }
}

export type HttpSourceError =
  | HttpRequestError
  | HttpResponseBodyError
  | HttpStreamError;
