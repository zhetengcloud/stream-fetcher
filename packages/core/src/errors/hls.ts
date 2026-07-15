export class PlaylistRequestError {
  readonly _tag: "PlaylistRequestError" = "PlaylistRequestError";
  readonly status: number;
  constructor(payload: { status: number }) {
    this.status = payload.status;
  }
}

export class PlaylistTextError {
  readonly _tag: "PlaylistTextError" = "PlaylistTextError";
  readonly cause: unknown;
  constructor(payload: { cause: unknown }) {
    this.cause = payload.cause;
  }
}

export class SegmentRequestError {
  readonly _tag: "SegmentRequestError" = "SegmentRequestError";
  readonly status: number;
  constructor(payload: { status: number }) {
    this.status = payload.status;
  }
}

export type HlsError =
  | PlaylistRequestError
  | PlaylistTextError
  | SegmentRequestError;
