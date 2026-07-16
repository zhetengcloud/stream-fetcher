import { StreamFetcherError } from "@stream-fetcher/core/errors/base";
import { messages } from "@stream-fetcher/huya/messages";

export class HuyaInvalidUrlError extends StreamFetcherError {
  readonly url: string;

  constructor(args: { url: string }) {
    super({
      category: "invalid-input",
      message: `${messages.errors.invalidUrl}: ${args.url}`,
    });
    this.url = args.url;
  }
}

export class HuyaFetchError extends StreamFetcherError {
  constructor(args: { cause: unknown }) {
    super({
      category: "network",
      message: `${messages.errors.roomPageRequestFailed}: ${String(args.cause)}`,
      cause: args.cause,
    });
  }
}

export class HuyaRoomPageRequestError extends StreamFetcherError {
  readonly status: number;

  constructor(args: { status: number }) {
    super({
      category: "network",
      message: `${messages.errors.roomPageRequestFailed}: ${args.status}`,
    });
    this.status = args.status;
  }
}

export class HuyaRoomUnavailableError extends StreamFetcherError {
  constructor() {
    super({
      category: "stream-unavailable",
      message: messages.errors.roomUnavailable,
    });
  }
}

export class HuyaReplayError extends StreamFetcherError {
  constructor() {
    super({
      category: "stream-unavailable",
      message: messages.errors.replay,
    });
  }
}

export class HuyaOfflineOrMissingDataError extends StreamFetcherError {
  constructor() {
    super({
      category: "stream-unavailable",
      message: messages.errors.offlineOrMissingData,
    });
  }
}

export type HuyaRoomDataErrorReason = "not-found" | "incomplete" | "parse-failed";

const roomDataMessages: Record<HuyaRoomDataErrorReason, string> = {
  "not-found": messages.errors.roomDataNotFound,
  incomplete: messages.errors.roomDataIncomplete,
  "parse-failed": messages.errors.roomDataParseFailed,
};

export class HuyaRoomDataError extends StreamFetcherError {
  readonly reason: HuyaRoomDataErrorReason;

  constructor(args: { reason: HuyaRoomDataErrorReason; cause?: unknown }) {
    const baseMessage = roomDataMessages[args.reason];
    super({
      category: "platform-data",
      message: args.cause !== undefined ? `${baseMessage}: ${String(args.cause)}` : baseMessage,
      cause: args.cause,
    });
    this.reason = args.reason;
  }
}

export type HuyaStreamDataErrorReason =
  | "not-found"
  | "incomplete"
  | "parse-failed"
  | "empty"
  | "live-info-empty";

const streamDataMessages: Record<HuyaStreamDataErrorReason, string> = {
  "not-found": messages.errors.streamDataNotFound,
  incomplete: messages.errors.streamDataIncomplete,
  "parse-failed": messages.errors.streamDataParseFailed,
  empty: messages.errors.streamDataEmpty,
  "live-info-empty": messages.errors.liveInfoEmpty,
};

export class HuyaStreamDataError extends StreamFetcherError {
  readonly reason: HuyaStreamDataErrorReason;

  constructor(args: { reason: HuyaStreamDataErrorReason; cause?: unknown }) {
    const baseMessage = streamDataMessages[args.reason];
    super({
      category: "platform-data",
      message: args.cause !== undefined ? `${baseMessage}: ${String(args.cause)}` : baseMessage,
      cause: args.cause,
    });
    this.reason = args.reason;
  }
}

export class HuyaAntiCodeDecodeError extends StreamFetcherError {
  constructor(args: { cause: unknown }) {
    super({
      category: "unexpected",
      message: `${messages.errors.antiCodeDecodeFailed}: ${String(args.cause)}`,
      cause: args.cause,
    });
  }
}

export class HuyaNoStreamUrlError extends StreamFetcherError {
  constructor() {
    super({
      category: "stream-unavailable",
      message: messages.errors.noUsableCdn,
    });
  }
}
