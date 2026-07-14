import type { Effect, Stream } from "effect";
import type { FileSystem, Sink } from "@stream-fetcher/core/types";

/** Options for the file sink. */
export interface FileSinkOptions<E = Error> {
  path: string;
  fs: FileSystem<E>;
}

/** Writes the byte stream to a file using the supplied FileSystem adapter. */
export class FileSink<E = Error> implements Sink<E, FileSinkOptions<E>> {
  readonly name = "file";

  write(
    stream: Stream.Stream<Uint8Array, E, never>,
    options: FileSinkOptions<E>,
  ): Effect.Effect<void, E, never> {
    return options.fs.write(options.path, stream);
  }
}
