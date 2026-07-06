import { Effect, Stream } from "effect";
import type { EffectFileSystem, FileSystem } from "@stream-fetcher/core/types";

/** Creates a FileSystem adapter backed by Deno APIs. */
export function createDenoFileSystem(): FileSystem {
  return {
    async write(
      path: string,
      stream: ReadableStream<Uint8Array>,
    ): Promise<void> {
      const file = await Deno.open(path, {
        write: true,
        create: true,
        truncate: true,
      });
      try {
        await stream.pipeTo(file.writable);
      } finally {
        file.close();
      }
    },
    async mkdir(dir: string): Promise<void> {
      await Deno.mkdir(dir, { recursive: true });
    },
  };
}

/** Creates an EffectFileSystem adapter backed by Deno APIs. */
export function createDenoEffectFileSystem(): EffectFileSystem {
  return {
    write(path: string, stream: Stream.Stream<Uint8Array, Error, never>) {
      return Effect.gen(function* () {
        const readable = yield* Stream.toReadableStreamEffect(stream);
        yield* Effect.acquireUseRelease(
          Effect.promise(() =>
            Deno.open(path, {
              write: true,
              create: true,
              truncate: true,
            })
          ),
          (file) =>
            Effect.tryPromise({
              try: () => readable.pipeTo(file.writable),
              catch: (err) => new Error(String(err)),
            }),
          (file) => Effect.sync(() => file.close()),
        );
      });
    },
    mkdir(dir: string) {
      return Effect.promise(() => Deno.mkdir(dir, { recursive: true }));
    },
  };
}
