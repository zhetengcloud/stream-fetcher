import { messages } from "@stream-fetcher/huya/messages";

export interface FetchRoomPageOptions {
  referer: string;
  roomId: string;
  webBase?: string;
}

/** Fetches the Huya room HTML page. */
export async function fetchRoomPage(
  options: FetchRoomPageOptions,
): Promise<string> {
  const base = (options.webBase ?? messages.api.webBaseUrl).replace(/\/$/, "");
  const response = await fetch(`${base}/${options.roomId}`, {
    headers: {
      referer: options.referer,
      "user-agent": messages.api.userAgent,
    },
  });

  if (!response.ok) {
    throw new Error(
      `${messages.errors.roomPageRequestFailed}: ${response.status}`,
    );
  }

  return decodeHtmlEntities(await response.text());
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/\u0026quot;/g, `"`)
    .replace(/\u0026#34;/g, `"`)
    .replace(/\u0026#x22;/g, `"`)
    .replace(/\u0026amp;/g, "\u0026")
    .replace(/\u0026lt;/g, "\u003c")
    .replace(/\u0026gt;/g, "\u003e");
}
