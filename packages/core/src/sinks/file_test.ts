import { assertEquals } from "@std/assert";
import { FileSink } from "@stream-fetcher/core";
import type { FileSystem } from "@stream-fetcher/core";

function createInMemoryFs(): {
  fs: FileSystem;
  files: Map<string, Uint8Array>;
} {
  const files = new Map<string, Uint8Array>();

  const fs: FileSystem = {
    async write(
      path: string,
      stream: ReadableStream<Uint8Array>,
    ): Promise<void> {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          chunks.push(result.value.slice());
        }
      } finally {
        reader.releaseLock();
      }
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        merged.set(c, offset);
        offset += c.length;
      }
      files.set(path, merged);
    },
    async mkdir(): Promise<void> {
      // no-op for in-memory fs
    },
  };

  return { fs, files };
}

function byteStream(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

Deno.test("FileSink writes chunks through the supplied FileSystem", async () => {
  const { fs, files } = createInMemoryFs();
  const sink = new FileSink();
  const source = byteStream([
    new TextEncoder().encode("hello"),
    new TextEncoder().encode(" "),
    new TextEncoder().encode("world"),
  ]);

  await sink.write(source, { path: "/tmp/foo.bin", fs });

  assertEquals(
    new TextDecoder().decode(files.get("/tmp/foo.bin")),
    "hello world",
  );
});
