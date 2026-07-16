import { Data } from "effect";
import { messages } from "@stream-fetcher/huya/messages";

export class HuyaInvalidUrlError extends Data.TaggedError("HuyaInvalidUrlError")<{
  url: string;
}> {
  constructor(args: { url: string }) {
    super(args);
    this.message = `${messages.errors.invalidUrl}: ${args.url}`;
  }
}

export class HuyaFetchError extends Data.TaggedError("HuyaFetchError")<{
  cause: unknown;
}> {
  constructor(args: { cause: unknown }) {
    super(args);
    this.message = `${messages.errors.roomPageRequestFailed}: ${String(args.cause)}`;
  }
}

export class HuyaRoomPageRequestError extends Data.TaggedError("HuyaRoomPageRequestError")<{
  status: number;
}> {
  constructor(args: { status: number }) {
    super(args);
    this.message = `${messages.errors.roomPageRequestFailed}: ${args.status}`;
  }
}

export class HuyaRoomUnavailableError extends Data.TaggedError("HuyaRoomUnavailableError") {
  constructor() {
    super();
    this.message = messages.errors.roomUnavailable;
  }
}

export class HuyaReplayError extends Data.TaggedError("HuyaReplayError") {
  constructor() {
    super();
    this.message = messages.errors.replay;
  }
}

export class HuyaOfflineOrMissingDataError extends Data.TaggedError(
  "HuyaOfflineOrMissingDataError",
) {
  constructor() {
    super();
    this.message = messages.errors.offlineOrMissingData;
  }
}

export type HuyaRoomDataErrorReason = "not-found" | "incomplete" | "parse-failed";

const roomDataMessages: Record<HuyaRoomDataErrorReason, string> = {
  "not-found": messages.errors.roomDataNotFound,
  incomplete: messages.errors.roomDataIncomplete,
  "parse-failed": messages.errors.roomDataParseFailed,
};

export class HuyaRoomDataError extends Data.TaggedError("HuyaRoomDataError")<{
  reason: HuyaRoomDataErrorReason;
  cause?: unknown;
}> {
  constructor(args: { reason: HuyaRoomDataErrorReason; cause?: unknown }) {
    super(args);
    this.message =
      args.cause !== undefined
        ? `${roomDataMessages[args.reason]}: ${String(args.cause)}`
        : roomDataMessages[args.reason];
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

export class HuyaStreamDataError extends Data.TaggedError("HuyaStreamDataError")<{
  reason: HuyaStreamDataErrorReason;
  cause?: unknown;
}> {
  constructor(args: { reason: HuyaStreamDataErrorReason; cause?: unknown }) {
    super(args);
    this.message =
      args.cause !== undefined
        ? `${streamDataMessages[args.reason]}: ${String(args.cause)}`
        : streamDataMessages[args.reason];
  }
}

export class HuyaAntiCodeDecodeError extends Data.TaggedError("HuyaAntiCodeDecodeError")<{
  cause: unknown;
}> {
  constructor(args: { cause: unknown }) {
    super(args);
    this.message = `${messages.errors.antiCodeDecodeFailed}: ${String(args.cause)}`;
  }
}

export class HuyaNoStreamUrlError extends Data.TaggedError("HuyaNoStreamUrlError") {
  constructor() {
    super();
    this.message = messages.errors.noUsableCdn;
  }
}

export type HuyaResolverError =
  | HuyaInvalidUrlError
  | HuyaFetchError
  | HuyaRoomPageRequestError
  | HuyaRoomUnavailableError
  | HuyaReplayError
  | HuyaOfflineOrMissingDataError
  | HuyaRoomDataError
  | HuyaStreamDataError
  | HuyaAntiCodeDecodeError
  | HuyaNoStreamUrlError;
