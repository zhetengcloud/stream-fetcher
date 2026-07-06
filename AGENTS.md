# Agent Guidelines

This document captures the project's engineering conventions. Update it when
conventions change.

## Code Quality

- **SOLID principles**: small, single-responsibility interfaces; platform
  details isolated from core; users depend on abstractions (`Source`, `Sink`,
  `Resolver`), not concrete implementations.
- **Web-standard interfaces**: `Source` returns
  `Promise<ReadableStream<Uint8Array>>`, `Sink` and `FileSystem` accept
  `ReadableStream<Uint8Array>` and return `Promise<void>`. Keep the core
  portable and runtime-agnostic.
- **Effect as the functional layer**: use `effect-ts` for typed error handling,
  complex request orchestration, and stream composition. Provide Effect variants
  (`EffectSource`, `EffectSink`, `EffectFileSystem`) alongside web-standard
  interfaces via adapters in `packages/core/src/adapters/effect.ts`.
- **Runtime-agnostic core**: no Deno-specific APIs in core. Runtime adapters
  provide file-system access.
- **Minimal external runtime deps in core**: only widely-adopted, portable
  libraries (e.g., Effect) may be core dependencies; avoid platform-specific or
  niche packages.
- **Tests** cover each package independently; a broken platform resolver must
  not block core CI.

## Dependency Policy

- Prefer npm packages over JSR-specific modules to avoid vendor lock-in to Deno.
- Effect is a core runtime dependency; use it as the functional/error-handling
  layer and for internal stream composition.
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

## Git Workflow

- **Do not commit without explicit user permission.** Wait for a clear "commit"
  instruction before running `git commit`.
- **Always create a new branch for new work.** Do not commit directly on `main`.
  Use a descriptive branch name (e.g. `refactor-huya-resolver`, `fix-s3-abort`).
- **Fast-forward merge only.** When merging to `main`, use `git merge --ff-only`
  to keep history linear. No merge commits.
