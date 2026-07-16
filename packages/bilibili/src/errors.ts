import { StreamFetcherError } from "@stream-fetcher/core/errors/base";
import { messages } from "@stream-fetcher/bilibili/messages";

export class BilibiliInvalidUrlError extends StreamFetcherError {
  readonly url: string;

  constructor(args: { url: string }) {
    super({
      category: "invalid-input",
      message: `${messages.errors.invalidUrl}: ${args.url}`,
    });
    this.url = args.url;
  }
}

export class BilibiliFetchError extends StreamFetcherError {
  constructor(args: { cause: unknown }) {
    super({
      category: "network",
      message: `${messages.errors.playUrlRequestFailed}: ${String(args.cause)}`,
      cause: args.cause,
    });
  }
}

export class BilibiliPlayUrlRequestError extends StreamFetcherError {
  readonly status: number;

  constructor(args: { status: number }) {
    super({
      category: "network",
      message: `${messages.errors.playUrlRequestFailed}: ${args.status}`,
    });
    this.status = args.status;
  }
}

export class BilibiliPlayUrlError extends StreamFetcherError {
  readonly code: number;
  readonly detail?: string;

  constructor(args: { code: number; message?: string }) {
    super({
      category: "platform-data",
      message: `${messages.errors.playUrlError}: ${args.code}${
        args.message ? ` - ${args.message}` : ""
      }`,
    });
    this.code = args.code;
    this.detail = args.message;
  }
}

export class BilibiliStreamUrlNotFoundError extends StreamFetcherError {
  constructor() {
    super({
      category: "stream-unavailable",
      message: messages.errors.streamUrlNotFound,
    });
  }
}
