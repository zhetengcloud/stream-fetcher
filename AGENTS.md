# Agent Guidelines

This document captures the project's engineering conventions. Update it when conventions change.

## Code Quality

- **SOLID principles**: small, single-responsibility interfaces; platform details isolated from core; users depend on abstractions (`Source`, `Sink`, `Resolver`), not concrete implementations.
- **Web Streams as public API**: `Source` returns `ReadableStream`, `Sink` accepts `WritableStream`. Portable and runtime-agnostic.
- **RxJS internally** (optional): used where it helps — polling, retry/backoff, fan-out — but hidden behind the public interfaces. Users are not required to depend on RxJS.
- **Runtime-agnostic core**: no Deno-specific APIs in core. Runtime adapters provide file-system access.
- **No external runtime deps in core** unless strictly necessary.
- **Tests** cover each package independently; a broken platform resolver must not block core CI.

## Dependency Policy

- Prefer npm packages over JSR-specific modules to avoid vendor lock-in to Deno.
- Keep core free of external runtime dependencies unless strictly necessary.
- Pin dependency versions in `deno.json` import maps.

## Resolver Conventions

- Each platform resolver lives in its own workspace package under `packages/<platform>/`.
- Implement the `Resolver<T>` interface from `@stream-fetcher/core/types`.
- Extract user-facing strings into `src/messages.ts` and export via the package's `deno.json` subpath.
- Keep platform-specific HTML/API markers and replay-detection strings in `messages.ts` for easy management.
- Mirror reference implementations (e.g., biliup) closely for anti-crack/anti-code logic, but adapt to TypeScript/Deno idioms.
- Use `HttpSource` from `@stream-fetcher/core/sources/http` for the resolved stream.

## Testing

- Unit tests live next to the source file they cover (`*_test.ts`).
- Mock external HTTP services with `Deno.serve({ port: 0 }, ...)`.
- Do not perform real network requests in unit tests.
- Run the full suite with `deno test --allow-all`.
