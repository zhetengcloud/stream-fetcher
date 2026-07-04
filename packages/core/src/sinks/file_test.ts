import { assertEquals } from "@std/assert";
import { FileSink } from "@stream-fetcher/core";
import type { FileSystem } from "@stream-fetcher/core";
import { lastValueFrom, Observable, of } from "rxjs";

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

Deno.test("FileSink writes chunks through the supplied FileSystem", async () => {
  const { fs, files } = createInMemoryFs();
  const sink = new FileSink();
  const source$ = new Observable<Uint8Array>((subscriber) => {
    subscriber.next(new TextEncoder().encode("hello"));
    subscriber.next(new TextEncoder().encode(" "));
    subscriber.next(new TextEncoder().encode("world"));
    subscriber.complete();
  });

  await lastValueFrom(sink.write(source$, { path: "/tmp/foo.bin", fs }), {
    defaultValue: undefined,
  });

  assertEquals(
    new TextDecoder().decode(files.get("/tmp/foo.bin")),
    "hello world",
  );
});
