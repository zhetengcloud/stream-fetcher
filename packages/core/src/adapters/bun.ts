import { Effect, Stream } from "effect";
import { mkdir } from "node:fs/promises";
import type { FileSystem } from "@stream-fetcher/core/types";

/** Creates a FileSystem adapter backed by Bun APIs. */
export function createBunFileSystem(): FileSystem<Error> {
  return {
    write(path: string, stream: Stream.Stream<Uint8Array, Error, never>) {
      return Effect.gen(function* () {
        const readable = yield* Stream.toReadableStreamEffect(stream);
        yield* Effect.tryPromise({
          try: () => Bun.write(path, readable),
          catch: (err) => new Error(String(err)),
        });
      });
    },
    mkdir(dir: string) {
      return Effect.promise(() => mkdir(dir, { recursive: true }));
    },
  };
}
