import type { Resolver, Source } from "@stream-fetcher/core/types";
import { HlsSource } from "@stream-fetcher/core/sources/hls";
import { HttpSource } from "@stream-fetcher/core/sources/http";
import { messages } from "./messages.ts";

const BILIBILI_API_BASE = "https://api.live.bilibili.com";
const BILIBILI_REFERER = "https://live.bilibili.com";
const BILIBILI_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export enum BilibiliProtocol {
  Flv = "flv",
  Hls = "hls",
}

export interface BilibiliResolverOptions {
  /** Preferred quality number. Defaults to 10000 (原画). */
  qn?: number;
  /** Preferred stream protocol. Defaults to "flv". */
  protocol?: BilibiliProtocol;
  /** Optional cookie string for authenticated requests. */
  cookie?: string;
  /** Internal: override the API base URL for tests. */
  _apiBase?: string;
}

interface PlayUrlResponse {
  code: number;
  message?: string;
  data?: {
    current_qn?: number;
    quality_description?: Array<{ qn: number; desc: string }>;
    durl?: Array<{ url: string }>;
  };
}

/** Resolves Bilibili live room URLs into an HttpSource. */
export class BilibiliResolver implements Resolver<BilibiliResolverOptions> {
  readonly platform = "bilibili";
  readonly #roomPattern =
    /(?:https?:\/\/)?(?:www\.|m\.|live\.)?bilibili\.com\/(?:blanc\/|h5\/)?(\d+)/;

  canHandle(url: string): boolean {
    return this.#roomPattern.test(url);
  }

  async resolve(
    url: string,
    options: BilibiliResolverOptions = {},
  ): Promise<Source> {
    const match = this.#roomPattern.exec(url);
    if (!match) throw new Error(messages.errors.invalidUrl(url));
    const roomId = match[1];

    const {
      qn = 10000,
      protocol = BilibiliProtocol.Flv,
      cookie,
      _apiBase,
    } = options;
    const streamUrl = await this.#fetchStreamUrl(
      roomId,
      qn,
      protocol,
      cookie,
      _apiBase,
    );

    const isHls = protocol === BilibiliProtocol.Hls;

    return {
      name: "bilibili",
      open: () => {
        const headers = {
          "user-agent": BILIBILI_USER_AGENT,
          referer: BILIBILI_REFERER,
          ...(cookie ? { cookie } : {}),
        };
        if (isHls) {
          return new HlsSource().open({
            playlistUrl: streamUrl,
            headers,
          });
        }
        return new HttpSource().open({ url: streamUrl, headers });
      },
    };
  }

  async #fetchStreamUrl(
    roomId: string,
    qn: number,
    protocol: BilibiliProtocol,
    cookie: string | undefined,
    apiBase: string | undefined,
  ): Promise<string> {
    const platform = protocol === BilibiliProtocol.Hls ? "hls" : "web";
    const apiUrl = new URL(
      "/room/v1/Room/playUrl",
      (apiBase ?? BILIBILI_API_BASE).replace(/\/$/, "") + "/",
    );
    apiUrl.searchParams.set("cid", roomId);
    apiUrl.searchParams.set("qn", String(qn));
    apiUrl.searchParams.set("platform", platform);

    const headers: Record<string, string> = {
      "user-agent": BILIBILI_USER_AGENT,
      referer: BILIBILI_REFERER,
    };
    if (cookie) headers.cookie = cookie;

    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      throw new Error(messages.errors.playUrlRequestFailed(response.status));
    }

    const data = (await response.json()) as PlayUrlResponse;
    if (data.code !== 0) {
      throw new Error(messages.errors.playUrlError(data.message, data.code));
    }

    const urls = data.data?.durl;
    if (!urls || urls.length === 0) {
      throw new Error(messages.errors.streamUrlNotFound);
    }

    return urls[0].url;
  }
}
