import type { FileSystem, Sink } from "@stream-fetcher/core/types";
import type { Observable } from "rxjs";

/** Options for the file sink. */
export interface FileSinkOptions {
  path: string;
  fs: FileSystem;
}

/** Writes the Observable's chunks to a file using the supplied FileSystem adapter. */
export class FileSink implements Sink<FileSinkOptions> {
  readonly name = "file";

  write(
    source$: Observable<Uint8Array>,
    options: FileSinkOptions,
  ): Observable<void> {
    return options.fs.write(options.path, source$);
  }
}
