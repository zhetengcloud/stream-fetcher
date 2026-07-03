import type { Sink } from "@stream-fetcher/core/types";

/** Writes the stream to Deno's stdout. */
export class StdoutSink implements Sink<undefined> {
  readonly name = "stdout";

  async open(): Promise<WritableStream<Uint8Array>> {
    const writer = Deno.stdout.writable.getWriter();

    return new WritableStream<Uint8Array>({
      write(chunk) {
        return writer.write(chunk);
      },
      close() {
        return writer.releaseLock();
      },
      abort() {
        writer.releaseLock();
      },
    });
  }
}
