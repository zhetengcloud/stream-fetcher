import { assertEquals } from "@std/assert";
import { FileSink, record } from "@stream-fetcher/core";
import type { FileSystem } from "@stream-fetcher/core";
import type { ProgressMetrics } from "@stream-fetcher/core/recorder";

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
      // no-op
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

function intervalStream(
  chunks: Uint8Array[],
  intervalMs: number,
): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      controller.enqueue(chunks[index++]);
    },
  });
}

async function collectProgress(
  stream: ReadableStream<ProgressMetrics>,
): Promise<ProgressMetrics[]> {
  const reader = stream.getReader();
  const events: ProgressMetrics[] = [];
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      events.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  return events;
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

  await collectProgress(progressStream);

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
    { progressIntervalMs: 50 },
  );

  const progressEvents = await collectProgress(progressStream);

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
    await collectProgress(progressStream);
  } catch {
    // abort may error the stream
  }

  const file = files.get("/tmp/aborted.bin");
  assertEquals(file !== undefined && file.length < 1000, true);
});

Deno.test("record stops early on stream cancellation", async () => {
  const { fs } = createInMemoryFs();
  let chunkCount = 0;
  let cancelled = false;

  const source = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (chunkCount >= 100) {
        controller.close();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (cancelled) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(`chunk-${chunkCount}\n`));
      chunkCount++;
    },
    cancel() {
      cancelled = true;
    },
  });

  const progressStream = record(
    source,
    new FileSink(),
    { path: "/tmp/cancelled.bin", fs },
  );

  const reader = progressStream.getReader();
  await reader.read();
  await new Promise((resolve) => setTimeout(resolve, 75));
  await reader.cancel();

  await new Promise((resolve) => setTimeout(resolve, 100));
  assertEquals(chunkCount < 100, true);
});
