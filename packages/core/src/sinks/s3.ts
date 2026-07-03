import type { Sink } from "@stream-fetcher/core/types";
import { signRequest } from "@stream-fetcher/core/utils/s3_sign";

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

/** Uploads a byte stream to S3-compatible object storage using multipart upload. */
export class S3Sink implements Sink<S3SinkOptions> {
  readonly name = "s3";

  async open(options: S3SinkOptions): Promise<WritableStream<Uint8Array>> {
    const client = new S3MultipartClient(options);
    return await client.open();
  }
}

class S3MultipartClient {
  #objectUrl: URL;
  #options: Required<S3SinkOptions>;
  #uploadId: string | null = null;
  #parts: CompletedPart[] = [];
  #partNumber = 1;
  #buffer = new Uint8Array(0);

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
      region: options.region ?? "us-east-1",
      service: options.service ?? "s3",
      partSize: options.partSize ?? 8 * 1024 * 1024,
      signal: options.signal ?? new AbortController().signal,
    };
  }

  async open(): Promise<WritableStream<Uint8Array>> {
    this.#uploadId = await this.#createMultipartUpload();

    return new WritableStream<Uint8Array>({
      write: (chunk) => this.#writeChunk(chunk),
      close: () => this.#close(),
      abort: () => this.#abort(),
    });
  }

  async #writeChunk(chunk: Uint8Array): Promise<void> {
    const combined = new Uint8Array(this.#buffer.length + chunk.length);
    combined.set(this.#buffer);
    combined.set(chunk, this.#buffer.length);
    this.#buffer = combined;

    while (this.#buffer.length >= this.#options.partSize) {
      const part = this.#buffer.subarray(0, this.#options.partSize);
      this.#buffer = this.#buffer.subarray(this.#options.partSize);
      const etag = await this.#uploadPart(part);
      this.#parts.push({ PartNumber: this.#partNumber, ETag: etag });
      this.#partNumber += 1;
    }
  }

  async #close(): Promise<void> {
    if (this.#buffer.length > 0) {
      const etag = await this.#uploadPart(this.#buffer);
      this.#parts.push({ PartNumber: this.#partNumber, ETag: etag });
    }
    await this.#completeMultipartUpload();
  }

  async #abort(): Promise<void> {
    await this.#abortMultipartUpload();
  }

  async #createMultipartUpload(): Promise<string> {
    const uploadUrl = new URL(this.#objectUrl);
    uploadUrl.searchParams.set("uploads", "");

    const headers = await signRequest({
      method: "POST",
      url: uploadUrl,
      headers: {
        // CreateMultipartUpload has an empty body. This is the SHA-256 hash of "",
        // required by AWS Signature Version 4's x-amz-content-sha256 header.
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

    const response = await fetch(uploadUrl, {
      method: "POST",
      headers,
      body: new Uint8Array(0) as BodyInit,
      signal: this.#options.signal,
    });

    if (!response.ok) {
      throw new Error(
        `createMultipartUpload failed: ${response.status} ${await response
          .text()}`,
      );
    }

    const xml = await response.text();
    const match = xml.match(/<UploadId>(.+?)<\/UploadId>/);
    if (!match) throw new Error("UploadId not found in response");
    return match[1];
  }

  async #uploadPart(body: Uint8Array): Promise<string> {
    const partUrl = new URL(this.#objectUrl);
    partUrl.searchParams.set("uploadId", this.#uploadId!);
    partUrl.searchParams.set("partNumber", String(this.#partNumber));

    const headers = await signRequest({
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

    const response = await fetch(partUrl, {
      method: "PUT",
      headers,
      body: body as BodyInit,
      signal: this.#options.signal,
    });

    if (!response.ok) {
      throw new Error(
        `uploadPart failed: ${response.status} ${await response.text()}`,
      );
    }

    const etag = response.headers.get("ETag");
    if (!etag) throw new Error("ETag missing from uploadPart response");
    return etag;
  }

  async #completeMultipartUpload(): Promise<void> {
    const completeUrl = new URL(this.#objectUrl);
    completeUrl.searchParams.set("uploadId", this.#uploadId!);

    const body = new TextEncoder().encode(
      `<CompleteMultipartUpload>` +
        this.#parts
          .map(
            (p) =>
              `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>${p.ETag}</ETag></Part>`,
          )
          .join("") +
        `</CompleteMultipartUpload>`,
    );

    const headers = await signRequest({
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

    const response = await fetch(completeUrl, {
      method: "POST",
      headers,
      body: body as BodyInit,
      signal: this.#options.signal,
    });

    if (!response.ok) {
      throw new Error(
        `completeMultipartUpload failed: ${response.status} ${await response
          .text()}`,
      );
    }
  }

  async #abortMultipartUpload(): Promise<void> {
    const abortUrl = new URL(this.#objectUrl);
    abortUrl.searchParams.set("uploadId", this.#uploadId!);

    const headers = await signRequest({
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

    await fetch(abortUrl, {
      method: "DELETE",
      headers,
      signal: this.#options.signal,
    });
  }
}
