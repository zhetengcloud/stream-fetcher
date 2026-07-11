import { Effect, Stream } from "effect";
import type { FileSystem } from "@stream-fetcher/core/types";

/** Creates a FileSystem adapter backed by Deno APIs. */
export function createDenoFileSystem(): FileSystem {
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
