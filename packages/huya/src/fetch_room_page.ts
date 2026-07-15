import { Effect } from "effect";
import { messages } from "@stream-fetcher/huya/messages";

export interface FetchRoomPageOptions {
  referer: string;
  roomId: string;
  webBase?: string;
}

/** Fetches the Huya room HTML page as an Effect. */
export function fetchRoomPage(options: FetchRoomPageOptions): Effect.Effect<string, Error, never> {
  return Effect.gen(function* () {
    const base = (options.webBase ?? messages.api.webBaseUrl).replace(/\/$/, "");
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(`${base}/${options.roomId}`, {
          headers: {
            referer: options.referer,
            "user-agent": messages.api.userAgent,
          },
        }),
      catch: (err: unknown) => (err instanceof Error ? err : new Error(String(err))),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new Error(`${messages.errors.roomPageRequestFailed}: ${response.status}`),
      );
    }

    const text = yield* Effect.tryPromise(() => response.text());
    return decodeHtmlEntities(text);
  });
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
