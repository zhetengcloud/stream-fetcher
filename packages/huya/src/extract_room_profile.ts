export interface StreamInfo {
  sStreamName: string;
  sCdnType: string;
  iWebPriorityRate: number;
  sFlvUrl?: string;
  sFlvUrlSuffix?: string;
  sFlvAntiCode?: string;
  sHlsUrl?: string;
  sHlsUrlSuffix?: string;
  sHlsAntiCode?: string;
}

export interface BitrateInfo {
  iBitRate: number;
}

export interface RoomProfile {
  title: string;
  cover: string;
  maxBitrate: number;
  bitrateInfo: BitrateInfo[];
  streamInfo: StreamInfo[];
}

export function extractRoomProfile(page: string): RoomProfile | null {
  const roomData = extractJsonAfter(
    page,
    /var\s+TT_ROOM_DATA\s*=\s*/,
    ";",
  );
  const roomState = typeof roomData.state === "string" ? roomData.state : "";

  const stream = extractStreamJson(page);
  const bitrateInfo = Array.isArray(stream.vMultiStreamInfo)
    ? stream.vMultiStreamInfo
    : [];

  if (roomState !== "ON" || bitrateInfo.length === 0) {
    return null;
  }

  const data = Array.isArray(stream.data) ? stream.data : [];
  const first = data[0];
  if (!first || typeof first !== "object") {
    throw new Error("Huya stream data is empty");
  }

  const gameLiveInfo = first.gameLiveInfo;
  if (!gameLiveInfo || typeof gameLiveInfo !== "object") {
    throw new Error("Huya live info is empty");
  }

  const streamInfo = Array.isArray(first.gameStreamInfoList)
    ? first.gameStreamInfoList
    : [];
  if (streamInfo.length === 0) {
    return null;
  }

  return {
    title: typeof gameLiveInfo.introduction === "string"
      ? gameLiveInfo.introduction
      : "",
    cover: typeof gameLiveInfo.screenshot === "string"
      ? gameLiveInfo.screenshot.replace(/^http:/, "https:")
      : "",
    maxBitrate: typeof gameLiveInfo.bitRate === "number"
      ? gameLiveInfo.bitRate
      : 0,
    bitrateInfo: bitrateInfo as BitrateInfo[],
    streamInfo: streamInfo as StreamInfo[],
  };
}

function extractJsonAfter(
  page: string,
  pattern: RegExp,
  end: string,
): Record<string, unknown> {
  const match = pattern.exec(page);
  if (!match) {
    throw new Error("Huya room data not found");
  }
  const start = match.index + match[0].length;
  const endIdx = page.indexOf(end, start);
  if (endIdx === -1) {
    throw new Error("Huya room data is incomplete");
  }
  const jsonText = page.slice(start, endIdx).trim();
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to parse Huya room data: ${err}`);
  }
}

function extractStreamJson(page: string): Record<string, unknown> {
  const marker = "stream: ";
  const start = page.indexOf(marker);
  if (start === -1) {
    throw new Error("Huya stream data not found");
  }
  const valueStart = start + marker.length;
  const end = findJsonValueEnd(page, valueStart);
  if (end === -1) {
    throw new Error("Huya stream data is incomplete");
  }
  const jsonText = page.slice(valueStart, end).trim();
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to parse Huya stream data: ${err}`);
  }
}

function findJsonValueEnd(input: string, start: number): number {
  const bytes = new TextEncoder().encode(input);
  let idx = start;
  while (idx < bytes.length && isAsciiWhitespace(bytes[idx])) {
    idx++;
  }

  const opening = bytes[idx];
  const closing = opening === 0x7B ? 0x7D : opening === 0x5B ? 0x5D : 0;
  if (!closing) return -1;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = idx; i < bytes.length; i++) {
    const byte = bytes[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (byte === 0x5C) {
        escaped = true;
      } else if (byte === 0x22) {
        inString = false;
      }
      continue;
    }

    if (byte === 0x22) {
      inString = true;
    } else if (byte === 0x7B || byte === 0x5B) {
      depth++;
    } else if (byte === 0x7D || byte === 0x5D) {
      if (depth === 0) return -1;
      depth--;
      if (depth === 0 && byte === closing) {
        return i + 1;
      }
    }
  }

  return -1;
}

function isAsciiWhitespace(byte: number): boolean {
  return byte === 0x20 || byte === 0x09 || byte === 0x0A || byte === 0x0D;
}
