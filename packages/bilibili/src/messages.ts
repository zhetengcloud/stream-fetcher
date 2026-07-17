import { messages as coreMessages } from "@stream-fetcher/core/messages";

/** User-facing strings, URL markers, and request constants for Bilibili. */
export const messages = {
  api: {
    baseUrl: "https://api.live.bilibili.com",
    webInterfaceBaseUrl: "https://api.bilibili.com",
    referer: "https://live.bilibili.com",
    userAgent: coreMessages.defaults.chromeUserAgent,
    playUrlEndpoint: "/room/v1/Room/playUrl",
    roomPlayInfoEndpoint: "/xlive/web-room/v2/index/getRoomPlayInfo",
    navEndpoint: "/x/web-interface/nav",
    webLocation: "444.8",
  },
  errors: {
    invalidUrl: "Invalid Bilibili room URL",
    playUrlRequestFailed: "Bilibili playUrl request failed",
    playUrlError: "Bilibili playUrl error",
    streamUrlNotFound: "Bilibili stream URL not found; room may be offline",
    cookieFileReadFailed: "Failed to read Bilibili cookie file",
    cookieFileInvalid: "Invalid Bilibili cookie file format",
    wbiKeyRequestFailed: "Bilibili WBI key request failed",
    wbiKeyMissing: "Bilibili WBI key missing in response",
  },
} as const;
