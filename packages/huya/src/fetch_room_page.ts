const HUYA_WEB_BASE_URL = "https://www.huya.com";
const HUYA_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FetchRoomPageOptions {
  referer: string;
  roomId: string;
  webBase?: string;
}

/** Fetches the Huya room HTML page. */
export async function fetchRoomPage(
  options: FetchRoomPageOptions,
): Promise<string> {
  const base = (options.webBase ?? HUYA_WEB_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${base}/${options.roomId}`, {
    headers: {
      referer: options.referer,
      "user-agent": HUYA_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Huya room page request failed: ${response.status}`,
    );
  }

  return decodeHtmlEntities(await response.text());
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/"/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#x22;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
