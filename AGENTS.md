# Agent Guidelines

This document captures the project's engineering conventions. Update it when
conventions change.

## Code Quality

- **SOLID principles**: small, single-responsibility interfaces; platform
  details isolated from core; users depend on abstractions (`Source`, `Sink`,
  `Resolver`), not concrete implementations.
- **RxJS as the standard reactive interface**: use RxJS `Observable` for all
  async/reactive flows, including public APIs and internal implementations.
  `Source` emits `Observable<Uint8Array>`; `Sink` and `FileSystem` accept
  `Observable<Uint8Array>` and return `Observable<void>`. Convert to Web Streams
  only at runtime boundaries when required.
- **Runtime-agnostic core**: no Deno-specific APIs in core. Runtime adapters
  provide file-system access.
- **Minimal external runtime deps in core**: only widely-adopted, portable
  libraries (e.g., RxJS) may be core dependencies; avoid platform-specific or
  niche packages.
- **Tests** cover each package independently; a broken platform resolver must
  not block core CI.

## Dependency Policy

- Prefer npm packages over JSR-specific modules to avoid vendor lock-in to Deno.
- RxJS is a core runtime dependency; use it as the standard reactive interface
  for both public APIs and internal flows.
- Pin dependency versions in `deno.json` import maps.

## Resolver Conventions

- Each platform resolver lives in its own workspace package under
  `packages/<platform>/`.
- Implement the `Resolver<T>` interface from `@stream-fetcher/core/types`.
- Extract user-facing strings into `src/messages.ts` and export via the
  package's `deno.json` subpath.
- Keep platform-specific HTML/API markers and replay-detection strings in
  `messages.ts` for easy management.
- Mirror reference implementations (e.g., biliup) closely for
  anti-crack/anti-code logic, but adapt to TypeScript/Deno idioms.
- Use `HttpSource` from `@stream-fetcher/core/sources/http` for the resolved
  stream.

## Testing

- Unit tests live next to the source file they cover (`*_test.ts`).
- Mock external HTTP services with `Deno.serve({ port: 0 }, ...)`.
- Do not perform real network requests in unit tests.
- Run the full suite with `deno test --allow-all`.

## Lint and Format

- Use Deno's built-in linter and formatter. Do not introduce separate ESLint or
  Prettier configurations.
- Run `deno lint` before committing to catch style and correctness issues.
- Run `deno fmt` before committing to ensure consistent formatting.
- Treat lint and format failures as CI failures; always check them alongside
  tests.
