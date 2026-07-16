import { messages } from "@stream-fetcher/core/messages";
import { StreamFetcherError } from "./base.ts";

export class PlaylistRequestError extends StreamFetcherError {
  readonly status: number;

  constructor(args: { status: number }) {
    super({
      category: "network",
      message: `${messages.errors.hlsPlaylistRequestFailed}: ${args.status}`,
    });
    this.status = args.status;
  }
}

export class PlaylistTextError extends StreamFetcherError {
  constructor(args: { cause: unknown }) {
    super({
      category: "platform-data",
      message: `${messages.errors.hlsPlaylistTextReadFailed}: ${String(args.cause)}`,
      cause: args.cause,
    });
  }
}

export class SegmentRequestError extends StreamFetcherError {
  readonly status: number;

  constructor(args: { status: number }) {
    super({
      category: "network",
      message: `${messages.errors.hlsSegmentRequestFailed}: ${args.status}`,
    });
    this.status = args.status;
  }
}
