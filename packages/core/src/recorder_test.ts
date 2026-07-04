import { assertEquals } from "@std/assert";
import { FileSink, record } from "@stream-fetcher/core";
import type { FileSystem, Source } from "@stream-fetcher/core";
import type { ProgressMetrics } from "@stream-fetcher/core/recorder";
import {
  ignoreElements,
  interval,
  lastValueFrom,
  map,
  Observable,
  of,
  take,
  tap,
  timer,
} from "rxjs";

function createInMemoryFs(): {
  fs: FileSystem;
  files: Map<string, Uint8Array>;
} {
  const files = new Map<string, Uint8Array>();

  const fs: FileSystem = {
    write(path: string, source$: Observable<Uint8Array>): Observable<void> {
      return new Observable<void>((subscriber) => {
        const chunks: Uint8Array[] = [];
        const subscription = source$.subscribe({
          next: (chunk) => chunks.push(chunk.slice()),
          error: (err) => subscriber.error(err),
          complete: () => {
            const total = chunks.reduce((acc, c) => acc + c.length, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const c of chunks) {
              merged.set(c, offset);
              offset += c.length;
            }
            files.set(path, merged);
            subscriber.complete();
          },
        });
        return () => subscription.unsubscribe();
      });
    },
    mkdir(): Observable<void> {
      return of(undefined);
    },
  };

  return { fs, files };
}

function arraySource(chunks: Uint8Array[]): Source<undefined> {
  return {
    name: "array",
    open() {
      return new Observable<Uint8Array>((subscriber) => {
        for (const chunk of chunks) {
          subscriber.next(chunk);
        }
        subscriber.complete();
      });
    },
  };
}

Deno.test("record copies source bytes to a single file sink", async () => {
  const { fs, files } = createInMemoryFs();
  const chunks = [
    new TextEncoder().encode("hello "),
    new TextEncoder().encode("world"),
  ];

  await lastValueFrom(
    record({
      source: arraySource(chunks),
      sink: new FileSink(),
      sinkOptions: { path: "/tmp/test.bin", fs },
    }).pipe(ignoreElements()),
    { defaultValue: undefined },
  );

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

  const progressEvents: ProgressMetrics[] = [];

  const source: Source<undefined> = {
    name: "slow-array",
    open() {
      return timer(0, 100).pipe(
        take(chunks.length),
        map((i) => chunks[i]),
      );
    },
  };

  await lastValueFrom(
    record({
      source,
      sink: new FileSink(),
      sinkOptions: { path: "/tmp/progress.bin", fs },
      progressIntervalMs: 50,
    }).pipe(tap((metrics) => progressEvents.push(metrics))),
    { defaultValue: undefined },
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

  const source: Source<undefined> = {
    name: "slow-array",
    open() {
      return interval(50).pipe(
        take(chunks.length),
        map((i) => chunks[i]),
      );
    },
  };

  setTimeout(() => controller.abort(), 75);

  await lastValueFrom(
    record({
      source,
      sink: new FileSink(),
      sinkOptions: { path: "/tmp/aborted.bin", fs },
      signal: controller.signal,
    }).pipe(ignoreElements()),
    { defaultValue: undefined },
  );

  const file = files.get("/tmp/aborted.bin");
  assertEquals(file !== undefined && file.length < 1000, true);
});

Deno.test("record stops early on unsubscribe", async () => {
  const { fs } = createInMemoryFs();
  let chunkCount = 0;

  const source: Source<undefined> = {
    name: "counting-array",
    open() {
      return interval(50).pipe(
        take(100),
        tap(() => chunkCount++),
        map((i) => new TextEncoder().encode(`chunk-${i}\n`)),
      );
    },
  };

  const subscription = record({
    source,
    sink: new FileSink(),
    sinkOptions: { path: "/tmp/unsubscribed.bin", fs },
  }).subscribe();

  await new Promise((resolve) => setTimeout(resolve, 75));
  const countAtUnsubscribe = chunkCount;
  subscription.unsubscribe();

  await new Promise((resolve) => setTimeout(resolve, 100));
  assertEquals(chunkCount, countAtUnsubscribe);
});
