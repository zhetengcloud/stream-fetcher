import { Data } from "effect";

type PlaylistRequestErrorPayload = { status: number };

export class PlaylistRequestError extends Data.TaggedError(
  "PlaylistRequestError",
)<PlaylistRequestErrorPayload> {}

type PlaylistTextErrorPayload = { cause: unknown };

export class PlaylistTextError extends Data.TaggedError(
  "PlaylistTextError",
)<PlaylistTextErrorPayload> {}

type SegmentRequestErrorPayload = { status: number };

export class SegmentRequestError extends Data.TaggedError(
  "SegmentRequestError",
)<SegmentRequestErrorPayload> {}

export type HlsError = PlaylistRequestError | PlaylistTextError | SegmentRequestError;
