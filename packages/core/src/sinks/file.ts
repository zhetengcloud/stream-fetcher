import type { FileSystem, Sink } from "../types.ts";

/** Options for the file sink. */
export interface FileSinkOptions {
  path: string;
  fs: FileSystem;
}

/** Writes the stream to a file using the supplied FileSystem adapter. */
export class FileSink implements Sink<FileSinkOptions> {
  readonly name = "file";

  async open(options: FileSinkOptions): Promise<WritableStream<Uint8Array>> {
    return await options.fs.open(options.path);
  }
}
