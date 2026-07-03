export const messages = {
  errors: {
    invalidUrl: (url: string) => `Invalid Huya room URL: ${url}`,
    roomUnavailable: "Huya room is unavailable",
    offlineOrMissingData: "Huya stream is offline or room data is missing",
    replay: "Huya room is showing a replay",
    roomPageRequestFailed: (status: number) =>
      `Huya room page request failed: ${status}`,
    streamDataEmpty: "Huya stream data is empty",
    liveInfoEmpty: "Huya live info is empty",
    noUsableCdn: "No usable Huya CDN stream URL found",
    roomDataNotFound: "Huya room data not found",
    roomDataIncomplete: "Huya room data is incomplete",
    roomDataParseFailed: (err: unknown) =>
      `Failed to parse Huya room data: ${err}`,
    streamDataNotFound: "Huya stream data not found",
    streamDataIncomplete: "Huya stream data is incomplete",
    streamDataParseFailed: (err: unknown) =>
      `Failed to parse Huya stream data: ${err}`,
  },
  pageMarkers: {
    roomNotFound: "找不到这个主播",
    roomBanned: "该主播涉嫌违规，正在整改中",
  },
  replayMarkers: {
    startsWith: ["回放", "重播"],
    endsWith: ["回放", "重播"],
  },
};
