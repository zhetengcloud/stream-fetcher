import { expect, test } from "bun:test";
import { Effect, Stream } from "effect";
import { FileSink } from "@stream-fetcher/core";
import type { FileSystem } from "@stream-fetcher/core";

function createInMemoryFs(): {
  fs: FileSystem;
  files: Map<string, Uint8Array>;
} {
  const files = new Map<string, Uint8Array>();

  const fs: FileSystem = {
    write(
      path: string,
      stream: Stream.Stream<Uint8Array, Error, never>,
    ): Effect.Effect<void, Error, never> {
      return stream.pipe(
        Stream.runCollect,
        Effect.map((chunk) => Array.from(chunk)),
        Effect.map((chunks) => {
          const total = chunks.reduce((acc, c) => acc + c.length, 0);
          const merged = new Uint8Array(total);
          let offset = 0;
          for (const c of chunks) {
            merged.set(c, offset);
            offset += c.length;
          }
          files.set(path, merged);
        }),
        Effect.map(() => undefined),
      );
    },
    mkdir(): Effect.Effect<void, Error, never> {
      return Effect.void;
    },
  };

  return { fs, files };
}

function byteStream(chunks: Uint8Array[]): Stream.Stream<Uint8Array, Error, never> {
  return Stream.fromIterable(chunks);
}

test("FileSink writes chunks through the supplied FileSystem", async () => {
  const { fs, files } = createInMemoryFs();
  const sink = new FileSink();
  const source = byteStream([
    new TextEncoder().encode("hello"),
    new TextEncoder().encode(" "),
    new TextEncoder().encode("world"),
  ]);

  await Effect.runPromise(sink.write(source, { path: "/tmp/foo.bin", fs }));

  expect(new TextDecoder().decode(files.get("/tmp/foo.bin"))).toBe("hello world");
});
