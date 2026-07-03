import type { FileSystem } from "@stream-fetcher/core/types";

/** Creates a FileSystem adapter backed by Deno APIs. */
export function createDenoFileSystem(): FileSystem {
  return {
    async open(path: string): Promise<WritableStream<Uint8Array>> {
      const file = await Deno.open(path, {
        write: true,
        create: true,
        truncate: true,
      });

      return new WritableStream<Uint8Array>({
        async write(chunk) {
          await file.write(chunk);
        },
        close() {
          file.close();
          return Promise.resolve();
        },
        abort() {
          file.close();
          return Promise.resolve();
        },
      });
    },
    async mkdir(dir: string): Promise<void> {
      await Deno.mkdir(dir, { recursive: true });
    },
  };
}
