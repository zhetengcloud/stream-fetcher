import type { Effect, Stream } from "effect";
import type {
  EffectFileSystem,
  EffectSink,
  FileSystem,
  Sink,
} from "@stream-fetcher/core/types";

/** Options for the file sink. */
export interface FileSinkOptions {
  path: string;
  fs: FileSystem;
}

/** Effect options for the file sink. */
export interface FileEffectSinkOptions {
  path: string;
  fs: EffectFileSystem;
}

/** Writes the byte stream to a file using the supplied FileSystem adapter. */
export class FileSink implements Sink<FileSinkOptions> {
  readonly name = "file";

  async write(
    stream: ReadableStream<Uint8Array>,
    options: FileSinkOptions,
  ): Promise<void> {
    await options.fs.write(options.path, stream);
  }
}

/** Effect-based file sink. */
export class FileEffectSink implements EffectSink<FileEffectSinkOptions> {
  readonly name = "file";

  write(
    stream: Stream.Stream<Uint8Array, Error, never>,
    options: FileEffectSinkOptions,
  ): Effect.Effect<void, Error, never> {
    return options.fs.write(options.path, stream);
  }
}
