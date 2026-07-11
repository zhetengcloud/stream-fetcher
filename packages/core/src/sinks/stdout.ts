import { Effect, Stream } from "effect";
import type { Sink } from "@stream-fetcher/core/types";

/** Writes the byte stream to Deno's stdout. */
export class StdoutSink implements Sink<undefined> {
  readonly name = "stdout";

  write(
    stream: Stream.Stream<Uint8Array, Error, never>,
  ): Effect.Effect<void, Error, never> {
    return Effect.gen(function* () {
      const readable = yield* Stream.toReadableStreamEffect(stream);
      yield* Effect.tryPromise({
        try: () => readable.pipeTo(Deno.stdout.writable),
        catch: (err) => new Error(String(err)),
      });
    });
  }
}
