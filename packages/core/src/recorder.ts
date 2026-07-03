import type { RecorderOptions, Source, Sink } from "./types.ts";
import { RecorderStatus } from "./types.ts";

/** Await a promise and ignore any error. Useful for cleanup. */
function ignore(promise: Promise<unknown>): Promise<void> {
  return promise.then(() => {}, () => {});
}

/**
 * Recorder coordinates one Source -> N Sinks.
 *
 * It opens the source stream, fans out chunks to every sink, reports progress,
 * and ensures all sinks are closed when recording stops or errors.
 */
export class Recorder<S = unknown, K = unknown> {
  #options: RecorderOptions<S, K>;
  #status: RecorderStatus = RecorderStatus.Idle;
  #abortController = new AbortController();
  #sourceStream: ReadableStream<Uint8Array> | null = null;
  #sinkStreams: ReadableStream<Uint8Array>[] = [];
  #sinkWriters: WritableStreamDefaultWriter<Uint8Array>[] = [];
  #startTime = 0;
  #bytes = 0;
  #chunkCount = 0;
  #progressTimer: number | null = null;

  constructor(options: RecorderOptions<S, K>) {
    this.#options = options;
    // Wire up an external AbortSignal so stop() is called automatically.
    if (options.signal) {
      options.signal.addEventListener("abort", () => this.stop());
    }
  }

  /** Current lifecycle state of the recorder. */
  get status(): RecorderStatus {
    return this.#status;
  }

  /** Start recording. Resolves when the source stream ends or stop() is called. */
  async start(): Promise<void> {
    if (this.#status === RecorderStatus.Running) return;
    this.#status = RecorderStatus.Running;
    this.#startTime = performance.now();

    try {
      this.#sourceStream = await this.#options.source.open(
        this.#options.sourceOptions,
      );

      this.#sinkWriters = [];
      this.#sinkStreams = [];

      for (let i = 0; i < this.#options.sinks.length; i++) {
        const sink = this.#options.sinks[i];
        const sinkOptions = this.#options.sinkOptions?.[i];
        const writable = await sink.open(sinkOptions);
        this.#sinkWriters.push(writable.getWriter());
      }

      this.#startProgress();
      await this.#pumpSource();
    } catch (error) {
      this.#status = RecorderStatus.Error;
      this.#options.onError?.(error, {});
      throw error;
    } finally {
      await this.stop();
    }
  }

  /** Stop recording and close all sinks. Safe to call multiple times. */
  async stop(): Promise<void> {
    if (
      this.#status === RecorderStatus.Stopped ||
      this.#status === RecorderStatus.Error
    ) return;
    this.#status = RecorderStatus.Stopped;
    this.#abortController.abort();
    this.#stopProgress();

    for (const stream of this.#sinkStreams) {
      ignore(stream.cancel());
    }

    await Promise.all(
      this.#sinkWriters.map((writer) => ignore(writer.close())),
    );
    await ignore(this.#options.source.close?.() ?? Promise.resolve());
  }

  /** Read from the source and write each chunk into every sink. */
  async #pumpSource(): Promise<void> {
    if (!this.#sourceStream) return;

    // Fan out to each sink writer. If only one sink, no tee needed.
    const writers = this.#sinkWriters;
    const reader = this.#sourceStream.getReader();

    while (this.#status === RecorderStatus.Running) {
      const result = await reader.read();
      if (result.done) break;

      const chunk = result.value;
      this.#bytes += chunk.length;
      this.#chunkCount += 1;

      await Promise.all(
        writers.map((writer) =>
          writer.write(chunk).catch(() => {
            this.stop();
          })
        ),
      );
    }

    reader.releaseLock();
  }

  /** Emit throughput/health metrics at the configured interval while running. */
  #startProgress(): void {
    if (!this.#options.onProgress) return;
    const intervalMs = this.#options.progressIntervalMs ?? 1000;
    this.#progressTimer = setInterval(() => {
      const elapsedMs = performance.now() - this.#startTime;
      this.#options.onProgress?.({
        bytes: this.#bytes,
        elapsedMs,
        bitrateKbps: elapsedMs > 0 ? (this.#bytes * 8) / elapsedMs : 0,
        chunkCount: this.#chunkCount,
      });
    }, intervalMs) as unknown as number;
  }

  /** Stop emitting progress metrics. */
  #stopProgress(): void {
    if (this.#progressTimer !== null) {
      clearInterval(this.#progressTimer);
      this.#progressTimer = null;
    }
  }
}
