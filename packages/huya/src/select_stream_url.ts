import { Effect } from "effect";
import type { BitrateInfo } from "./extract_room_profile.ts";
import { messages } from "@stream-fetcher/huya/messages";

export interface ApplyRatioOptions {
  url: string;
  bitrateInfo: BitrateInfo[];
  maxBitrate: number;
  maxRatio: number;
}

/** Appends the best matching bitrate ratio to the URL if requested. */
export function applyRatio(options: ApplyRatioOptions): string {
  const { url, bitrateInfo, maxBitrate, maxRatio } = options;

  if (maxRatio === 0 || url.includes("ratio=")) {
    return url;
  }

  const ratios = bitrateInfo
    .map((info) =>
      typeof info.iBitRate === "number" ? info.iBitRate : maxBitrate
    )
    .filter((bitrate) => bitrate > 0 && bitrate <= maxRatio);

  const selectedRatio = ratios.length > 0 ? Math.max(...ratios) : 0;
  if (selectedRatio > 0) {
    return `${url}&ratio=${selectedRatio}`;
  }
  return url;
}

export interface SelectStreamUrlOptions {
  streamUrls: Array<{ cdn: string; url: string }>;
  preferredCdn?: string;
}

/** Selects the preferred CDN or the highest-priority available URL as an Effect. */
export function selectStreamUrl(
  options: SelectStreamUrlOptions,
): Effect.Effect<string, Error, never> {
  const { streamUrls, preferredCdn } = options;
  const selected = preferredCdn && preferredCdn.length > 0
    ? streamUrls.find((s) => s.cdn === preferredCdn)
    : undefined;
  const result = selected ?? streamUrls[0];
  if (!result) {
    return Effect.fail(new Error(messages.errors.noUsableCdn));
  }
  return Effect.succeed(result.url);
}
