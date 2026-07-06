import { messages as coreMessages } from "@stream-fetcher/core/messages";

/** User-facing strings, page markers, and request constants for Huya. */
export const messages = {
  platform: "huya",
  api: {
    webBaseUrl: "https://www.huya.com",
    userAgent: coreMessages.defaults.chromeUserAgent,
  },
  stream: {
    codec: "264",
    antiCode: {
      ctypeDefault: "huya_live",
      platformIdDefault: "100",
      fsDefault: "bgct",
      ver: "1",
    },
  },
  pageMarkers: {
    roomNotFound: "找不到这个主播",
    roomBanned: "该主播涉嫌违规，正在整改中",
  },
  replayMarkers: {
    startsWith: ["回放", "重播"],
    endsWith: ["回放", "重播"],
  },
  scriptMarkers: {
    roomDataEnd: ";",
    streamObject: "stream: ",
  },
  errors: {
    invalidUrl: "Invalid Huya room URL",
    roomUnavailable: "Huya room is unavailable",
    offlineOrMissingData: "Huya stream is offline or room data is missing",
    replay: "Huya room is showing a replay",
    roomPageRequestFailed: "Huya room page request failed",
    streamDataEmpty: "Huya stream data is empty",
    liveInfoEmpty: "Huya live info is empty",
    noUsableCdn: "No usable Huya CDN stream URL found",
    roomDataNotFound: "Huya room data not found",
    roomDataIncomplete: "Huya room data is incomplete",
    roomDataParseFailed: "Failed to parse Huya room data",
    streamDataNotFound: "Huya stream data not found",
    streamDataIncomplete: "Huya stream data is incomplete",
    streamDataParseFailed: "Failed to parse Huya stream data",
  },
} as const;
