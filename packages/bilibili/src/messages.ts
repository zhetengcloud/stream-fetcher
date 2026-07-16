import { messages as coreMessages } from "@stream-fetcher/core/messages";

/** User-facing strings, URL markers, and request constants for Bilibili. */
export const messages = {
  api: {
    baseUrl: "https://api.live.bilibili.com",
    referer: "https://live.bilibili.com",
    userAgent: coreMessages.defaults.chromeUserAgent,
    playUrlEndpoint: "/room/v1/Room/playUrl",
  },
  errors: {
    invalidUrl: "Invalid Bilibili room URL",
    playUrlRequestFailed: "Bilibili playUrl request failed",
    playUrlError: "Bilibili playUrl error",
    streamUrlNotFound: "Bilibili stream URL not found; room may be offline",
  },
} as const;
