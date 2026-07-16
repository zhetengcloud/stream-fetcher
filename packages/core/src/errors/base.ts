import { Data } from "effect";

/** High-level classification of a stream-fetcher error. */
export type ErrorCategory =
  | "invalid-input"
  | "network"
  | "platform-data"
  | "stream-unavailable"
  | "unexpected";

const StreamFetcherErrorBase = Data.TaggedError("StreamFetcherError")<{
  readonly category: ErrorCategory;
  readonly message: string;
  readonly cause?: unknown;
}>;

/**
 * Abstract base class for all stream-fetcher errors.
 *
 * Provides a stable, user-facing interface so callers can handle errors without
 * depending on concrete `_tag` values or using `instanceof` checks.
 */
export abstract class StreamFetcherError extends StreamFetcherErrorBase {
  /** Returns a human-readable description of the error. */
  display(): string {
    return this.message;
  }

  /** Returns the underlying cause, if any. */
  getCause(): unknown {
    return this.cause;
  }
}
