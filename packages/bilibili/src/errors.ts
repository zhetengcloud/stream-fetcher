import { Data } from "effect";

export class BilibiliInvalidUrlError extends Data.TaggedError("BilibiliInvalidUrlError")<{
  url: string;
}> {}

export class BilibiliFetchError extends Data.TaggedError("BilibiliFetchError")<{
  cause: unknown;
}> {}

export class BilibiliPlayUrlRequestError extends Data.TaggedError("BilibiliPlayUrlRequestError")<{
  status: number;
}> {}

export class BilibiliPlayUrlError extends Data.TaggedError("BilibiliPlayUrlError")<{
  code: number;
  message?: string;
}> {}

export class BilibiliStreamUrlNotFoundError extends Data.TaggedError(
  "BilibiliStreamUrlNotFoundError",
) {}

export type BilibiliResolverError =
  | BilibiliInvalidUrlError
  | BilibiliFetchError
  | BilibiliPlayUrlRequestError
  | BilibiliPlayUrlError
  | BilibiliStreamUrlNotFoundError;
