import { messages } from "@stream-fetcher/core/messages";
import { StreamFetcherError } from "./base.ts";

export class HttpRequestError extends StreamFetcherError {
  readonly status: number;
  readonly statusText: string;

  constructor(args: { status: number; statusText: string }) {
    super({
      category: "network",
      message: `${messages.errors.httpRequestFailed}: ${args.status} ${args.statusText}`,
    });
    this.status = args.status;
    this.statusText = args.statusText;
  }
}

export class HttpResponseBodyError extends StreamFetcherError {
  constructor() {
    super({
      category: "unexpected",
      message: messages.errors.responseBodyIsNull,
    });
  }
}

export class HttpStreamError extends StreamFetcherError {
  constructor(args: { cause: unknown }) {
    super({
      category: "network",
      message: `${messages.errors.httpRequestFailed}: ${String(args.cause)}`,
      cause: args.cause,
    });
  }
}
