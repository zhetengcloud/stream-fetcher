import { Effect } from "effect";
import md5 from "md5";
import { messages } from "@stream-fetcher/bilibili/messages";
import { StreamFetcherError } from "@stream-fetcher/core/errors/base";
import { BilibiliWbiKeyError, BilibiliWbiRequestError } from "./errors.ts";

/** Position map used to derive the WBI mixin key from the img/sub keys. */
const KEY_MAP: ReadonlyArray<number> = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28,
  14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54,
  21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

const UPDATE_INTERVAL_SECONDS = 2 * 60 * 60;

interface NavResponse {
  data?: {
    wbi_img?: {
      img_url?: string;
      sub_url?: string;
    };
  };
}

/** Extracts the filename stem from a WBI image URL (e.g. "abc123" from ".../abc123.png"). */
function extractKey(url: string): string | undefined {
  const filename = url.split("/").pop();
  if (!filename) return undefined;
  const stem = filename.split(".")[0];
  return stem || undefined;
}

/** Derives the 32-byte mixin key from the img and sub keys. */
function createMixinKey(img: string, sub: string): string {
  const full = `${img}${sub}`;
  return KEY_MAP.slice(0, 32)
    .map((index) => full[index])
    .join("");
}

/** Encodes a query value the same way Bilibili's WBI signing expects. */
function wbiEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function buildSignedParams(key: string, params: Map<string, string>): Map<string, string> {
  const timestamp = nowSeconds();
  const withTimestamp = new Map(params);
  withTimestamp.set("wts", String(timestamp));

  const sorted = new Map([...withTimestamp.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const query = [...sorted.entries()].map(([k, v]) => `${wbiEncode(k)}=${wbiEncode(v)}`).join("&");

  const signature = md5(`${query}${key}`);
  withTimestamp.set("w_rid", signature);
  return withTimestamp;
}

/**
 * Stateful WBI request signer.
 *
 * Fetches the per-user key pair from `/x/web-interface/nav` and caches the
 * derived mixin key for two hours, mirroring biliup's implementation.
 */
export class WbiSigner {
  private key: string | undefined;
  private lastUpdate = 0;

  constructor(private readonly navBaseUrl: string = messages.api.webInterfaceBaseUrl) {}

  /**
   * Returns the cached mixin key, refreshing it from the nav endpoint when
   * missing or stale.
   */
  private getKey(
    headers: Record<string, string>,
  ): Effect.Effect<string, BilibiliWbiKeyError | BilibiliWbiRequestError, never> {
    const now = nowSeconds();
    if (this.key !== undefined && now - this.lastUpdate < UPDATE_INTERVAL_SECONDS) {
      return Effect.succeed(this.key);
    }

    return Effect.gen(this, function* () {
      const url = new URL(messages.api.navEndpoint, this.navBaseUrl.replace(/\/$/, "") + "/");
      const response = yield* Effect.tryPromise({
        try: () => fetch(url, { headers }),
        catch: (err: unknown) => new BilibiliWbiKeyError({ cause: err }),
      });

      if (!response.ok) {
        return yield* Effect.fail(new BilibiliWbiRequestError({ status: response.status }));
      }

      const data = yield* Effect.tryPromise({
        try: (): Promise<NavResponse> => response.json(),
        catch: (err: unknown) => new BilibiliWbiKeyError({ cause: err }),
      });

      const imgUrl = data.data?.wbi_img?.img_url;
      const subUrl = data.data?.wbi_img?.sub_url;
      if (!imgUrl || !subUrl) {
        return yield* Effect.fail(new BilibiliWbiKeyError({}));
      }

      const img = extractKey(imgUrl);
      const sub = extractKey(subUrl);
      if (!img || !sub) {
        return yield* Effect.fail(new BilibiliWbiKeyError({}));
      }

      const key = createMixinKey(img, sub);
      this.key = key;
      this.lastUpdate = nowSeconds();
      return key;
    });
  }

  /**
   * Returns a new param map containing `wts` and `w_rid` signature params.
   */
  sign(
    params: Map<string, string>,
    headers: Record<string, string>,
  ): Effect.Effect<Map<string, string>, StreamFetcherError, never> {
    return Effect.gen(this, function* () {
      const key = yield* this.getKey(headers);
      return buildSignedParams(key, params);
    });
  }
}
