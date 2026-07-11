import type { Effect, Stream } from "effect";
import type { FileSystem, Sink } from "@stream-fetcher/core/types";

/** Options for the file sink. */
export interface FileSinkOptions {
  path: string;
  fs: FileSystem;
}

/** Writes the byte stream to a file using the supplied FileSystem adapter. */
export class FileSink implements Sink<FileSinkOptions> {
  readonly name = "file";

  write(
    stream: Stream.Stream<Uint8Array, Error, never>,
    options: FileSinkOptions,
  ): Effect.Effect<void, Error, never> {
    return options.fs.write(options.path, stream);
  }
}
