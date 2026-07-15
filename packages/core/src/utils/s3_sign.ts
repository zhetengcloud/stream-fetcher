/**
 * AWS Signature Version 4 signing for S3-compatible object storage.
 *
 * Reference: https://docs.aws.amazon.com/general/latest/gr/signature-version-4.html
 */

import { Effect } from "effect";

export interface SignRequestOptions {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: Uint8Array;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: string;
}

export function signRequest(options: SignRequestOptions): Effect.Effect<Headers, Error, never> {
  return Effect.tryPromise({
    try: () => signRequestPromise(options),
    catch: (err) => (err instanceof Error ? err : new Error(String(err))),
  });
}

async function signRequestPromise(options: SignRequestOptions): Promise<Headers> {
  const {
    method,
    url,
    headers: baseHeaders,
    body,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region,
    service,
  } = options;

  const now = new Date();
  const dateStamp = formatDate(now);
  const amzDate = formatDateTime(now);

  const host = url.host;
  const headers = new Headers(baseHeaders);
  headers.set("host", host);
  headers.set("x-amz-date", amzDate);
  if (sessionToken) headers.set("x-amz-security-token", sessionToken);

  const payloadHash = await sha256Hex(body);
  headers.set("x-amz-content-sha256", payloadHash);

  const canonicalHeaders = Array.from(headers.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}\n`)
    .join("");

  const signedHeaders = Array.from(headers.keys())
    .map((k) => k.toLowerCase())
    .sort()
    .join(";");

  const canonicalRequest = [
    method,
    encodeURIComponent(url.pathname).replace(/%2F/g, "/"),
    url.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  headers.set(
    "authorization",
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  );

  return headers;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function formatDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", toBufferSource(data));
  return toHex(new Uint8Array(hash));
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmac(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return await hmac(kService, "aws4_request");
}

async function hmac(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    toBufferSource(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

async function hmacHex(key: Uint8Array, message: string): Promise<string> {
  return toHex(await hmac(key, message));
}

function toHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Coerce a Uint8Array into a BufferSource accepted by Web Crypto APIs. */
function toBufferSource(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}
