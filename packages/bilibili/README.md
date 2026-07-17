# @stream-fetcher/bilibili

Bilibili live-room resolver for stream-fetcher.

## What it does

Takes a Bilibili live room URL and returns a `Source` that produces the raw
stream bytes. It also fills in metadata such as room ID, title, format, and the
resolved play URL.

## Stream resolution

The resolver extracts the room ID from URLs like:

- `https://live.bilibili.com/12345`
- `https://www.bilibili.com/12345`
- `https://m.bilibili.com/12345`

It then asks Bilibili for a playable stream URL. Two endpoints are supported:

1. **Unsigned `playUrl` (default)**  
   Fast and anonymous. Works for most public rooms.

2. **WBI-signed `getRoomPlayInfo` (opt-in)**  
   Required for some authenticated or higher-quality streams. Enable with
   `useWbi: true`.

You choose the endpoint through resolver options; the package keeps the simple
path as the default so anonymous usage keeps working.

## Authentication

Bilibili auth is cookie-based. Pass credentials in one of two ways:

- **`cookie`** — a raw `Cookie` header string.
- **`cookieFile`** — path to a JSON file in biliup's `cookie_info.cookies`
  format. The resolver reads the file and joins all name/value pairs into a
  single `Cookie` header.

The cookie is sent on every API request and reused as stream-request headers so
access-restricted segments stay authenticated.

### WBI signing

Some Bilibili endpoints reject unsigned requests. When `useWbi: true`, the
resolver:

1. Calls `/x/web-interface/nav` to fetch two WBI image URLs.
2. Extracts the image keys and derives a 32-byte mixin key.
3. Caches that mixin key for two hours.
4. Adds a timestamp (`wts`) and an MD5 signature (`w_rid`) to every signed
   request.

This mirrors biliup's WBI implementation.

## Options

| Option       | Description                                       |
| ------------ | ------------------------------------------------- |
| `qn`         | Preferred quality number. Default `10000` (原画). |
| `protocol`   | `flv` or `hls`. Default `flv`.                    |
| `cookie`     | Raw cookie string.                                |
| `cookieFile` | Path to a biliup-style cookie JSON file.          |
| `useWbi`     | Use the WBI-signed endpoint. Default `false`.     |

Only one of `cookie` or `cookieFile` is needed; `cookie` takes precedence if
both are provided.

## Errors

All errors extend the shared `StreamFetcherError` base class, so callers can
use `.display()` and `.getCause()` without inspecting concrete `_tag` values.

Common failure modes:

- Invalid room URL
- Network or non-OK API response
- API returned a non-zero code
- No stream URL found (room offline or region-restricted)
- Cookie file missing or malformed
- WBI key missing or nav request failed
