import { Effect, Stream } from "effect";
import type {
  EffectFileSystem,
  EffectSink,
  EffectSource,
  FileSystem,
  Sink,
  Source,
} from "@stream-fetcher/core/types";

/** Adapts a web-standard Source into an EffectSource. */
export function toEffectSource<T>(source: Source<T>): EffectSource<T> {
  return {
    name: source.name,
    open: (options?: T) =>
      Stream.fromEffect(
        Effect.tryPromise({
          try: () => source.open(options),
          catch: (err) => new Error(String(err)),
        }),
      ).pipe(
        Stream.flatMap((readable) =>
          Stream.fromReadableStream(
            () => readable,
            (err) => new Error(String(err)),
          )
        ),
      ),
  };
}

/** Adapts an EffectSource into a web-standard Source. */
export function toSource<T>(source: EffectSource<T>): Source<T> {
  return {
    name: source.name,
    open: (options?: T) =>
      Effect.runPromise(
        Stream.toReadableStreamEffect(source.open(options)),
      ),
  };
}

/** Adapts a web-standard Sink into an EffectSink. */
export function toEffectSink<T>(sink: Sink<T>): EffectSink<T> {
  return {
    name: sink.name,
    write: (stream, options?: T) =>
      Effect.gen(function* () {
        const readable = yield* Stream.toReadableStreamEffect(stream);
        yield* Effect.tryPromise({
          try: () => sink.write(readable, options),
          catch: (err) => new Error(String(err)),
        });
      }),
  };
}

/** Adapts an EffectSink into a web-standard Sink. */
export function toSink<T>(sink: EffectSink<T>): Sink<T> {
  return {
    name: sink.name,
    write: (stream, options?: T) =>
      Effect.runPromise(
        sink.write(
          Stream.fromReadableStream(
            () => stream,
            (err) => new Error(String(err)),
          ),
          options,
        ),
      ),
  };
}

/** Adapts a web-standard FileSystem into an EffectFileSystem. */
export function toEffectFileSystem(fs: FileSystem): EffectFileSystem {
  return {
    write: (path, stream) =>
      Effect.gen(function* () {
        const readable = yield* Stream.toReadableStreamEffect(stream);
        yield* Effect.tryPromise({
          try: () => fs.write(path, readable),
          catch: (err) => new Error(String(err)),
        });
      }),
    mkdir: (dir) =>
      Effect.tryPromise({
        try: () => fs.mkdir(dir),
        catch: (err) => new Error(String(err)),
      }),
  };
}

/** Adapts an EffectFileSystem into a web-standard FileSystem. */
export function toFileSystem(fs: EffectFileSystem): FileSystem {
  return {
    write: (path, stream) =>
      Effect.runPromise(
        fs.write(
          path,
          Stream.fromReadableStream(
            () => stream,
            (err) => new Error(String(err)),
          ),
        ),
      ),
    mkdir: (dir) => Effect.runPromise(fs.mkdir(dir)),
  };
}
