import type { ResolvedStream, Resolver } from "@stream-fetcher/core/types";
import { HlsSource } from "@stream-fetcher/core/sources/hls";
import { HttpSource } from "@stream-fetcher/core/sources/http";
import { messages } from "@stream-fetcher/bilibili/messages";

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
    title?: string;
    durl?: Array<{ url: string }>;
  };
}

/** Resolves Bilibili live room URLs into a ResolvedStream. */
export class BilibiliResolver implements Resolver<BilibiliResolverOptions> {
  readonly platform = messages.platform;
  readonly #roomPattern =
    /(?:https?:\/\/)?(?:www\.|m\.|live\.)?bilibili\.com\/(?:blanc\/|h5\/)?(\d+)/;

  canHandle(url: string): boolean {
    return this.#roomPattern.test(url);
  }

  async resolve(
    url: string,
    options: BilibiliResolverOptions = {},
  ): Promise<ResolvedStream> {
    const match = this.#roomPattern.exec(url);
    if (!match) throw new Error(`${messages.errors.invalidUrl}: ${url}`);
    const roomId = match[1];

    const {
      qn = 10000,
      protocol = BilibiliProtocol.Flv,
      cookie,
      _apiBase,
    } = options;

    const isHls = protocol === BilibiliProtocol.Hls;
    const headers = {
      "user-agent": messages.api.userAgent,
      referer: messages.api.referer,
      ...(cookie ? { cookie } : {}),
    };

    const { streamUrl, title } = await this.#fetchStreamUrl(
      roomId,
      qn,
      protocol,
      cookie,
      _apiBase,
    );

    const metadata = {
      platform: this.platform,
      format: protocol,
      title,
      roomId,
      playUrl: streamUrl,
      resolvedAt: new Date(),
    };

    const source = isHls ? new HlsSource() : new HttpSource();

    const sourceOptions = isHls
      ? { playlistUrl: streamUrl, headers }
      : { url: streamUrl, headers };

    return {
      metadata,
      source: {
        name: messages.platform,
        open: () => source.open(sourceOptions as never),
      },
    };
  }

  async #fetchStreamUrl(
    roomId: string,
    qn: number,
    protocol: BilibiliProtocol,
    cookie: string | undefined,
    _apiBase: string | undefined,
  ): Promise<{ streamUrl: string; title?: string }> {
    const platform = protocol === BilibiliProtocol.Hls
      ? messages.api.platforms.hls
      : messages.api.platforms.web;
    const apiUrl = new URL(
      messages.api.playUrlEndpoint,
      (_apiBase ?? messages.api.baseUrl).replace(/\/$/, "") + "/",
    );
    apiUrl.searchParams.set("cid", roomId);
    apiUrl.searchParams.set("qn", String(qn));
    apiUrl.searchParams.set("platform", platform);

    const headers: Record<string, string> = {
      "user-agent": messages.api.userAgent,
      referer: messages.api.referer,
    };
    if (cookie) headers.cookie = cookie;

    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      throw new Error(
        `${messages.errors.playUrlRequestFailed}: ${response.status}`,
      );
    }

    const data = (await response.json()) as PlayUrlResponse;
    if (data.code !== 0) {
      throw new Error(
        `${messages.errors.playUrlError}: ${
          data.message ?? `code ${data.code}`
        }`,
      );
    }

    const urls = data.data?.durl;
    if (!urls || urls.length === 0) {
      throw new Error(messages.errors.streamUrlNotFound);
    }

    return {
      streamUrl: urls[0].url,
      title: data.data?.title,
    };
  }
}
