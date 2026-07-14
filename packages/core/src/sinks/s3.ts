import { Effect, Ref, Stream } from "effect";
import type { Sink } from "@stream-fetcher/core/types";
import { signRequest } from "@stream-fetcher/core/utils/s3_sign";
import { messages } from "@stream-fetcher/core/messages";

export interface S3SinkOptions {
  /** S3 endpoint, e.g. https://s3.amazonaws.com or https://oss-cn-hangzhou.aliyuncs.com */
  endpoint: string | URL;
  /** Bucket name. */
  bucket: string;
  /** Object key. */
  key: string;
  /** Access key ID. */
  accessKeyId: string;
  /** Secret access key. */
  secretAccessKey: string;
  /** Optional session token for temporary credentials. */
  sessionToken?: string;
  /** AWS region. Defaults to "us-east-1". */
  region?: string;
  /** Service name for signing. Defaults to "s3". Use "oss" for Alibaba Cloud OSS. */
  service?: string;
  /** Part size threshold in bytes for multipart upload. Defaults to 8 MiB. */
  partSize?: number;
  /** AbortSignal for cancelling the upload. */
  signal?: AbortSignal;
}

interface CompletedPart {
  PartNumber: number;
  ETag: string;
}

interface UploadState {
  buffer: Uint8Array;
  partNumber: number;
  parts: CompletedPart[];
}

/** Uploads a byte stream to S3-compatible object storage using multipart upload. */
export class S3Sink implements Sink<Error, S3SinkOptions> {
  readonly name = "s3";

  write(
    stream: Stream.Stream<Uint8Array, Error, never>,
    options: S3SinkOptions,
  ): Effect.Effect<void, Error, never> {
    const client = new S3MultipartClient(options);
    return client.write(stream);
  }
}

class S3MultipartClient {
  #objectUrl: URL;
  #options: Required<S3SinkOptions>;

  constructor(options: S3SinkOptions) {
    const endpoint = options.endpoint.toString().replace(/\/$/, "");
    const baseUrl = new URL(`${options.bucket}/`, endpoint);
    this.#objectUrl = new URL(options.key, baseUrl);
    this.#options = {
      endpoint: options.endpoint,
      bucket: options.bucket,
      key: options.key,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      sessionToken: options.sessionToken ?? "",
      region: options.region ?? messages.defaults.s3Region,
      service: options.service ?? messages.defaults.s3Service,
      partSize: options.partSize ?? messages.defaults.s3PartSizeBytes,
      signal: options.signal ?? new AbortController().signal,
    };
  }

  write(
    stream: Stream.Stream<Uint8Array, Error, never>,
  ): Effect.Effect<void, Error, never> {
    return Effect.gen(this, function* () {
      const uploadId = yield* this.#createMultipartUpload();
      const state = yield* Ref.make<UploadState>({
        buffer: new Uint8Array(0),
        partNumber: 1,
        parts: [],
      });

      const upload = stream.pipe(
        Stream.runForEach((chunk) => this.#handleChunk(chunk, state, uploadId)),
      );

      yield* upload.pipe(
        Effect.catchAll((err) =>
          this.#abortMultipartUpload(uploadId).pipe(
            Effect.flatMap(() => Effect.fail(err)),
          )
        ),
      );

      yield* this.#flushRemainingAndComplete(state, uploadId);
    });
  }

  #handleChunk(
    chunk: Uint8Array,
    state: Ref.Ref<UploadState>,
    uploadId: string,
  ): Effect.Effect<void, Error, never> {
    return Effect.gen(this, function* () {
      const current = yield* Ref.get(state);
      let buffer = concat(current.buffer, chunk);
      let partNumber = current.partNumber;
      const parts = [...current.parts];

      while (buffer.length >= this.#options.partSize) {
        const part = buffer.subarray(0, this.#options.partSize);
        buffer = buffer.subarray(this.#options.partSize);
        const etag = yield* this.#uploadPart(part, partNumber, uploadId);
        parts.push({ PartNumber: partNumber, ETag: etag });
        partNumber++;
      }

      yield* Ref.set(state, { buffer, partNumber, parts });
    });
  }

  #flushRemainingAndComplete(
    state: Ref.Ref<UploadState>,
    uploadId: string,
  ): Effect.Effect<void, Error, never> {
    return Effect.gen(this, function* () {
      const current = yield* Ref.get(state);
      if (current.buffer.length === 0) {
        yield* this.#completeMultipartUpload(uploadId, current.parts);
        return;
      }
      const etag = yield* this.#uploadPart(
        current.buffer,
        current.partNumber,
        uploadId,
      );
      const parts = [
        ...current.parts,
        { PartNumber: current.partNumber, ETag: etag },
      ];
      yield* this.#completeMultipartUpload(uploadId, parts);
    });
  }

  #createMultipartUpload(): Effect.Effect<string, Error, never> {
    return Effect.gen(this, function* () {
      const uploadUrl = new URL(this.#objectUrl);
      uploadUrl.searchParams.set("uploads", "");

      const headers = yield* signRequest({
        method: "POST",
        url: uploadUrl,
        headers: {
          "x-amz-content-sha256":
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
        body: new Uint8Array(0),
        accessKeyId: this.#options.accessKeyId,
        secretAccessKey: this.#options.secretAccessKey,
        sessionToken: this.#options.sessionToken || undefined,
        region: this.#options.region,
        service: this.#options.service,
      });

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(uploadUrl, {
            method: "POST",
            headers,
            body: new Uint8Array(0) as BodyInit,
            signal: this.#options.signal,
          }),
        catch: (err) => err instanceof Error ? err : new Error(String(err)),
      });

      if (!response.ok) {
        const text = yield* Effect.tryPromise(() => response.text());
        return yield* Effect.fail(
          new Error(
            `${messages.errors.s3CreateMultipartUploadFailed}: ${response.status} ${text}`,
          ),
        );
      }

      const xml = yield* Effect.tryPromise(() => response.text());
      const match = xml.match(/<UploadId>(.+?)<\/UploadId>/);
      if (!match) {
        return yield* Effect.fail(
          new Error(messages.errors.s3UploadIdNotFound),
        );
      }
      return match[1];
    });
  }

  #uploadPart(
    body: Uint8Array,
    partNumber: number,
    uploadId: string,
  ): Effect.Effect<string, Error, never> {
    return Effect.gen(this, function* () {
      const partUrl = new URL(this.#objectUrl);
      partUrl.searchParams.set("uploadId", uploadId);
      partUrl.searchParams.set("partNumber", String(partNumber));

      const headers = yield* signRequest({
        method: "PUT",
        url: partUrl,
        headers: {},
        body,
        accessKeyId: this.#options.accessKeyId,
        secretAccessKey: this.#options.secretAccessKey,
        sessionToken: this.#options.sessionToken || undefined,
        region: this.#options.region,
        service: this.#options.service,
      });

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(partUrl, {
            method: "PUT",
            headers,
            body: body as BodyInit,
            signal: this.#options.signal,
          }),
        catch: (err) => err instanceof Error ? err : new Error(String(err)),
      });

      if (!response.ok) {
        const text = yield* Effect.tryPromise(() => response.text());
        return yield* Effect.fail(
          new Error(
            `${messages.errors.s3UploadPartFailed}: ${response.status} ${text}`,
          ),
        );
      }

      const etag = response.headers.get("ETag");
      if (!etag) {
        return yield* Effect.fail(
          new Error(messages.errors.s3EtagMissing),
        );
      }
      return etag;
    });
  }

  #completeMultipartUpload(
    uploadId: string,
    parts: CompletedPart[],
  ): Effect.Effect<void, Error, never> {
    return Effect.gen(this, function* () {
      const completeUrl = new URL(this.#objectUrl);
      completeUrl.searchParams.set("uploadId", uploadId);

      const body = new TextEncoder().encode(
        `<CompleteMultipartUpload>` +
          parts
            .map(
              (p) =>
                `<Part><PartNumber>${p.PartNumber}<\/PartNumber><ETag>${p.ETag}<\/ETag><\/Part>`,
            )
            .join("") +
          `<\/CompleteMultipartUpload>`,
      );

      const headers = yield* signRequest({
        method: "POST",
        url: completeUrl,
        headers: { "Content-Type": "application/xml" },
        body,
        accessKeyId: this.#options.accessKeyId,
        secretAccessKey: this.#options.secretAccessKey,
        sessionToken: this.#options.sessionToken || undefined,
        region: this.#options.region,
        service: this.#options.service,
      });

      const response = yield* Effect.tryPromise({
        try: () =>
          fetch(completeUrl, {
            method: "POST",
            headers,
            body: body as BodyInit,
            signal: this.#options.signal,
          }),
        catch: (err) => err instanceof Error ? err : new Error(String(err)),
      });

      if (!response.ok) {
        const text = yield* Effect.tryPromise(() => response.text());
        return yield* Effect.fail(
          new Error(
            `${messages.errors.s3CompleteMultipartUploadFailed}: ${response.status} ${text}`,
          ),
        );
      }
    });
  }

  #abortMultipartUpload(uploadId: string): Effect.Effect<void, never, never> {
    return Effect.gen(this, function* () {
      const abortUrl = new URL(this.#objectUrl);
      abortUrl.searchParams.set("uploadId", uploadId);

      const headers = yield* signRequest({
        method: "DELETE",
        url: abortUrl,
        headers: {},
        body: new Uint8Array(0),
        accessKeyId: this.#options.accessKeyId,
        secretAccessKey: this.#options.secretAccessKey,
        sessionToken: this.#options.sessionToken || undefined,
        region: this.#options.region,
        service: this.#options.service,
      });

      yield* Effect.tryPromise({
        try: () =>
          fetch(abortUrl, {
            method: "DELETE",
            headers,
            signal: this.#options.signal,
          }).then(() => undefined),
        catch: (err) => err instanceof Error ? err : new Error(String(err)),
      }).pipe(Effect.orElse(() => Effect.void));
    }).pipe(Effect.catchAll(() => Effect.void));
  }
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const combined = new Uint8Array(a.length + b.length);
  combined.set(a);
  combined.set(b, a.length);
  return combined;
}
