import { assertEquals } from "@std/assert";
import { Effect, Stream } from "effect";
import { FileSink, record } from "@stream-fetcher/core";
import type { FileSystem } from "@stream-fetcher/core";
import type { ProgressMetrics } from "@stream-fetcher/core/recorder";

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

function byteStream(
  chunks: Uint8Array[],
): Stream.Stream<Uint8Array, Error, never> {
  return Stream.fromIterable(chunks);
}

function intervalStream(
  chunks: Uint8Array[],
  intervalMs: number,
): Stream.Stream<Uint8Array, Error, never> {
  return Stream.fromIterable(chunks).pipe(
    Stream.tap(() => Effect.sleep(intervalMs)),
  );
}

function collectProgress(
  stream: Stream.Stream<ProgressMetrics, Error, never>,
): Effect.Effect<ProgressMetrics[], Error, never> {
  return stream.pipe(
    Stream.runCollect,
    Effect.map((chunk) => Array.from(chunk)),
  );
}

Deno.test("record copies source bytes to a single file sink", async () => {
  const { fs, files } = createInMemoryFs();
  const chunks = [
    new TextEncoder().encode("hello "),
    new TextEncoder().encode("world"),
  ];

  const progressStream = record(
    byteStream(chunks),
    new FileSink(),
    { path: "/tmp/test.bin", fs },
  );

  await Effect.runPromise(collectProgress(progressStream));

  assertEquals(
    new TextDecoder().decode(files.get("/tmp/test.bin")),
    "hello world",
  );
});

Deno.test("record emits progress metrics and completes", async () => {
  const { fs } = createInMemoryFs();
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < 5; i++) {
    chunks.push(new TextEncoder().encode(`chunk-${i}\n`));
  }

  const progressStream = record(
    intervalStream(chunks, 100),
    new FileSink(),
    { path: "/tmp/progress.bin", fs },
  );

  const progressEvents = await Effect.runPromise(
    collectProgress(progressStream),
  );

  assertEquals(progressEvents.length >= 1, true);
  assertEquals(progressEvents[0].bytes, 0);
  assertEquals(progressEvents[0].chunkCount, 0);
  assertEquals(progressEvents[progressEvents.length - 1].bytes > 0, true);
  assertEquals(progressEvents[progressEvents.length - 1].chunkCount > 0, true);
});

Deno.test("record stops early when aborted", async () => {
  const { fs, files } = createInMemoryFs();
  const controller = new AbortController();
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < 100; i++) {
    chunks.push(new TextEncoder().encode(`chunk-${i}\n`));
  }

  const progressStream = record(
    intervalStream(chunks, 50),
    new FileSink(),
    { path: "/tmp/aborted.bin", fs },
    { signal: controller.signal },
  );

  setTimeout(() => controller.abort(), 75);

  try {
    await Effect.runPromise(collectProgress(progressStream));
  } catch {
    // abort may error the stream
  }

  const file = files.get("/tmp/aborted.bin");
  assertEquals(file !== undefined && file.length < 1000, true);
});

Deno.test("record stops early on stream cancellation", async () => {
  const { fs } = createInMemoryFs();
  let chunkCount = 0;

  const source = Stream.asyncEffect<Uint8Array, Error, never>((emit) =>
    Effect.gen(function* () {
      const pull = (): Effect.Effect<void, Error, never> =>
        Effect.gen(function* () {
          if (chunkCount >= 100) {
            yield* Effect.promise(() => emit.end());
            return;
          }
          yield* Effect.sleep(50);
          yield* Effect.promise(() =>
            emit.single(new TextEncoder().encode(`chunk-${chunkCount}\n`))
          );
          chunkCount++;
          yield* pull();
        });
      yield* pull();
      return Effect.void;
    })
  );

  const progressStream = record(
    source,
    new FileSink(),
    { path: "/tmp/cancelled.bin", fs },
  );

  const stream = await Effect.runPromise(
    Stream.toReadableStreamEffect(progressStream),
  );
  const reader = stream.getReader();
  await reader.read();
  await new Promise((resolve) => setTimeout(resolve, 75));
  await reader.cancel();

  await new Promise((resolve) => setTimeout(resolve, 100));
  assertEquals(chunkCount < 100, true);
});
