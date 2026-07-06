/** User-facing and diagnostic strings for the core package.
 *
 * These are static descriptive strings. Callers concatenate/interpolate
 * dynamic values in business code.
 */
export const messages = {
  errors: {
    httpRequestFailed: "HTTP request failed",
    responseBodyIsNull: "Response body is null",
    hlsPlaylistRequestFailed: "HLS playlist request failed",
    hlsSegmentRequestFailed: "HLS segment request failed",
    s3CreateMultipartUploadFailed: "S3 multipart upload creation failed",
    s3UploadIdNotFound: "UploadId not found in response",
    s3UploadPartFailed: "S3 multipart upload part failed",
    s3EtagMissing: "ETag missing from uploadPart response",
    s3CompleteMultipartUploadFailed: "S3 multipart upload completion failed",
  },
  defaults: {
    chromeUserAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    hlsRefreshIntervalMs: 2000,
    s3Region: "us-east-1",
    s3Service: "s3",
    s3PartSizeBytes: 8 * 1024 * 1024,
  },
} as const;
