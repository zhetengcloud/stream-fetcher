import { assertEquals } from "@std/assert";
import {
  FileSink,
  HttpSource,
  Recorder,
  RecorderStatus,
  StdoutSink,
} from "../mod.ts";
import type { FileSystem, Sink, Source } from "../mod.ts";

function createInMemoryFs(): { fs: FileSystem; files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();

  const fs: FileSystem = {
    async open(path: string): Promise<WritableStream<Uint8Array>> {
      const chunks: Uint8Array[] = [];
      return new WritableStream<Uint8Array>({
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
      });
    },
    async mkdir(): Promise<void> {
      return Promise.resolve();
    },
  };

  return { fs, files };
}

function arraySource(chunks: Uint8Array[]): Source<undefined> {
  return {
    name: "array",
    open() {
      return Promise.resolve(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            const chunk = chunks.shift();
            if (chunk) {
              controller.enqueue(chunk);
            } else {
              controller.close();
            }
          },
        }),
      );
    },
  };
}

Deno.test("Recorder copies source bytes to a single file sink", async () => {
  const { fs, files } = createInMemoryFs();
  const chunks = [
    new TextEncoder().encode("hello "),
    new TextEncoder().encode("world"),
  ];

  const recorder = new Recorder({
    source: arraySource(chunks),
    sinks: [new FileSink()],
    sinkOptions: [{ path: "/tmp/test.bin", fs }],
  });

  await recorder.start();

  assertEquals(recorder.status, RecorderStatus.Stopped);
  assertEquals(
    new TextDecoder().decode(files.get("/tmp/test.bin")),
    "hello world",
  );
});

Deno.test("Recorder fans out to multiple file sinks", async () => {
  const { fs: fs1, files: files1 } = createInMemoryFs();
  const { fs: fs2, files: files2 } = createInMemoryFs();
  const chunks = [new TextEncoder().encode("a"), new TextEncoder().encode("b")];

  const recorder = new Recorder({
    source: arraySource(chunks),
    sinks: [new FileSink(), new FileSink()],
    sinkOptions: [
      { path: "/tmp/one.bin", fs: fs1 },
      { path: "/tmp/two.bin", fs: fs2 },
    ],
  });

  await recorder.start();

  assertEquals(new TextDecoder().decode(files1.get("/tmp/one.bin")), "ab");
  assertEquals(new TextDecoder().decode(files2.get("/tmp/two.bin")), "ab");
});

Deno.test("Recorder reports progress", async () => {
  const { fs } = createInMemoryFs();
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < 5; i++) {
    chunks.push(new TextEncoder().encode(`chunk-${i}\n`));
  }

  const progressEvents: Parameters<
    NonNullable<ConstructorParameters<typeof Recorder>[0]["onProgress"]>
  >[0][] = [];

  const source: Source<undefined> = {
    name: "slow-array",
    open() {
      let index = 0;
      return Promise.resolve(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (index < chunks.length) {
              controller.enqueue(chunks[index++]);
              await new Promise((r) => setTimeout(r, 100));
            } else {
              controller.close();
            }
          },
        }),
      );
    },
  };

  const recorder = new Recorder({
    source,
    sinks: [new FileSink()],
    sinkOptions: [{ path: "/tmp/progress.bin", fs }],
    progressIntervalMs: 50,
    onProgress(metrics) {
      progressEvents.push(metrics);
    },
  });

  await recorder.start();

  assertEquals(progressEvents.length >= 1, true);
  assertEquals(progressEvents[0].bytes >= 1, true);
  assertEquals(progressEvents[0].chunkCount >= 1, true);
});

Deno.test("Recorder stops early when aborted", async () => {
  const { fs, files } = createInMemoryFs();
  const controller = new AbortController();
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < 100; i++) {
    chunks.push(new TextEncoder().encode(`chunk-${i}\n`));
  }

  const source: Source<undefined> = {
    name: "slow-array",
    open() {
      let index = 0;
      return Promise.resolve(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (index < chunks.length) {
              controller.enqueue(chunks[index++]);
              await new Promise((r) => setTimeout(r, 50));
            } else {
              controller.close();
            }
          },
        }),
      );
    },
  };

  const recorder = new Recorder({
    source,
    sinks: [new FileSink()],
    sinkOptions: [{ path: "/tmp/aborted.bin", fs }],
    signal: controller.signal,
  });

  const startPromise = recorder.start();
  setTimeout(() => controller.abort(), 75);
  await startPromise;

  assertEquals(recorder.status, RecorderStatus.Stopped);
  const file = files.get("/tmp/aborted.bin");
  assertEquals(file !== undefined && file.length < 1000, true);
});
