import type { Source } from "@stream-fetcher/core/types";

/** Options for the generic HTTP(S) source. */
export interface HttpSourceOptions {
  url: string | URL;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Fetches a raw HTTP(S) stream and exposes it as a Source. */
export class HttpSource implements Source<HttpSourceOptions> {
  readonly name = "http";
  #response: Response | null = null;

  async open(options: HttpSourceOptions): Promise<ReadableStream<Uint8Array>> {
    this.#response = await fetch(options.url, {
      headers: options.headers,
      signal: options.signal,
    });

    if (!this.#response.ok) {
      throw new Error(
        `HTTP ${this.#response.status}: ${this.#response.statusText}`,
      );
    }

    if (!this.#response.body) {
      throw new Error("Response body is null");
    }

    return this.#response.body;
  }

  close(): Promise<void> {
    this.#response = null;
    return Promise.resolve();
  }
}
