import { assertEquals } from "@std/assert";
import { FileSink } from "@stream-fetcher/core";
import type { FileSystem } from "@stream-fetcher/core";

function createInMemoryFs(): {
  fs: FileSystem;
  files: Map<string, Uint8Array>;
} {
  const files = new Map<string, Uint8Array>();

  const fs: FileSystem = {
    open(path: string): Promise<WritableStream<Uint8Array>> {
      const chunks: Uint8Array[] = [];
      return Promise.resolve(
        new WritableStream<Uint8Array>({
          write(chunk) {
            chunks.push(chunk.slice());
            return Promise.resolve();
          },
          close() {
            const total = chunks.reduce((acc, c) => acc + c.length, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.length;
            }
            files.set(path, merged);
            return Promise.resolve();
          },
        }),
      );
    },
    mkdir(): Promise<void> {
      return Promise.resolve();
    },
  };

  return { fs, files };
}

Deno.test("FileSink writes chunks through the supplied FileSystem", async () => {
  const { fs, files } = createInMemoryFs();
  const sink = new FileSink();
  const stream = await sink.open({ path: "/tmp/foo.bin", fs });
  const writer = stream.getWriter();

  await writer.write(new TextEncoder().encode("hello"));
  await writer.write(new TextEncoder().encode(" "));
  await writer.write(new TextEncoder().encode("world"));
  await writer.close();

  assertEquals(
    new TextDecoder().decode(files.get("/tmp/foo.bin")),
    "hello world",
  );
});
