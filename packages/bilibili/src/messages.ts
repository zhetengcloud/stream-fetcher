export const messages = {
  errors: {
    invalidUrl: (url: string) => `Invalid Bilibili room URL: ${url}`,
    playUrlRequestFailed: (status: number) =>
      `Bilibili playUrl request failed: ${status}`,
    playUrlError: (message: string | undefined, code: number) =>
      `Bilibili playUrl error: ${message ?? `code ${code}`}`,
    streamUrlNotFound: "Bilibili stream URL not found; room may be offline",
  },
};
