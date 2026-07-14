import { Data } from "effect";

type PlaylistRequestErrorPayload = { status: number };

export class PlaylistRequestError
  extends Data.TaggedError("PlaylistRequestError")<
    PlaylistRequestErrorPayload
  > {}

type PlaylistTextErrorPayload = { cause: unknown };

export class PlaylistTextError
  extends Data.TaggedError("PlaylistTextError")<PlaylistTextErrorPayload> {}

export class PlaylistAbortedError
  extends Data.TaggedError("PlaylistAbortedError") {}

type SegmentRequestErrorPayload = { status: number };

export class SegmentRequestError
  extends Data.TaggedError("SegmentRequestError")<SegmentRequestErrorPayload> {}

export type HlsError =
  | PlaylistRequestError
  | PlaylistTextError
  | PlaylistAbortedError
  | SegmentRequestError;
