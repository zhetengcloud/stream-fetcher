# stream-fetcher

A minimal Deno/TS library for fetching live streams and piping them to file, S3/OSS, stdout, or other sinks.

Inspired by [Streamlink](https://github.com/streamlink/streamlink) and [biliup](https://github.com/biliup/biliup).

## Goal

Provide a small, composable core for live stream recording in server-side / microservice / Kubernetes environments. No CLI, no UI — just sources, sinks, and a recorder.

## Status

Early design phase. See [`PLAN.md`](./PLAN.md) for architecture and milestones.

## License

MIT
