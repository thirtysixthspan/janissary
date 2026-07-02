# Actionable startup errors

**Complexity: 3/10** — one small new module plus surgical edits to three existing files; the logic is a simple error-code mapper, but it coordinates with two companion plans (help/version, strict-args) in the same catch block.

## Goal

When `janus` fails to start, the message tells the user what went wrong *and what to do about it*, and includes enough context (version, stack in debug mode) to file a useful report. Today the entire failure surface is one line (`src/main.ts:130-135`):

```
Failed to start Janissary: listen EADDRINUSE: address already in use 127.0.0.1:4100
```

The two realistic failure classes deserve specific guidance:

```
$ janus --port=4100
janus 1.1.0 — failed to start: port 4100 is already in use.
  Another janus (or other app) is listening there. Pick another port with --port=<n>,
  or omit --port to choose a free port automatically.

$ janus     # dev checkout, web bundle never built
janus 1.1.0 — failed to start: web UI bundle not found (web/dist).
  Run `npm run build:web` (or use `npm start`, which builds it first).
```

Additionally, a corrupt `.janissary/config.json` is currently *silently* replaced by defaults (`src/config.ts` catch block) — the user's settings vanish with no explanation. That should warn.

## Design decisions

**Detect-and-explain at the boundary, not deep error taxonomies.** Best practices #21/#22 suggest trackable error codes; for a local single-user app that's overweight. Instead: a small `explainStartupError(error): string | null` mapper that recognizes the known cases and returns multi-line guidance, falling back to the generic message. No `JAN-001` codes unless the set grows past a handful.

**Check preconditions before starting the server where cheap.** `boot()` computes `webDir` (`src/main.ts:114`) but never checks it exists when serving compiled — a missing bundle surfaces later as blank 404s in the browser, which is worse than failing at boot. Add an `existsSync(path.join(webDir, 'index.html'))` guard *only when not running under Vite dev* (dev flow serves web separately via `npm run dev:web`; confirm how `startServer` behaves with a missing `webDir` in dev before wiring the guard unconditionally).

**`EADDRINUSE` is mapped, not prevented.** Don't probe the port first (racy); let `startServer` fail and translate the error. Recognize by `(error as NodeJS.ErrnoException).code === 'EADDRINUSE'` and include the attempted port from the parsed args.

**Version in the error banner.** Practice #33: prefix fatal messages with `janus <version>` using `appVersion()` from [cli-help-version.md](cli-help-version.md). One line of glue; makes every screenshot/paste self-identifying.

**Debug mode via `JANUS_DEBUG=1`** (practice #23, minimal form): when set, print `error.stack` after the friendly message. An env var, not a flag, so it works even when the failure is in arg parsing itself. Document it in the `--help` text.

**Config corruption warns instead of silently defaulting.** In `loadConfig`'s catch (`src/config.ts`), write one stderr line: `warning: .janissary/config.json is invalid JSON — using defaults (file left untouched)`. Do *not* overwrite the broken file; the user may want to fix their edits. Non-fatal — the app still starts.

**New module `src/startup-errors.ts`.** `main.ts` is near the 200-line `max-lines` budget; the mapper, banner formatting, and debug-stack logic go in their own file, keeping the `main.ts` catch block to a few lines. Usage-error handling (exit 2) from [cli-strict-args.md](cli-strict-args.md) lives in the same catch — order the branches: `CliUsageError` → mapped startup error → generic.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Top-level catch to restructure | `src/main.ts:130-135` |
| `webDir` computation | `src/main.ts:114` |
| Server bind that raises `EADDRINUSE` | `src/index.ts` (`startServer` → `listen`) |
| Silent config-corruption catch | `src/config.ts` (`loadConfig` try/catch) |
| `appVersion()` (dependency: help/version plan) | `src/cli-args.ts` |
| stderr conventions (human text to stderr, machine line to stdout) | `src/main.ts:118-119` |

## Implementation

1. **`src/startup-errors.ts`** (new): `explainStartupError(error: unknown, context: { port?: number }): string | null` recognizing `EADDRINUSE` (and cheaply extendable: `EACCES` on privileged ports → "ports below 1024 need elevated privileges"); `formatFatal(message: string): string` producing the `janus <version> — failed to start: ...` banner; `maybeStack(error): string` gated on `process.env.JANUS_DEBUG`.
2. **`src/main.ts`**: add the `web/dist/index.html` precondition with its bespoke message (thrown as a plain `Error` whose message `explainStartupError` passes through, or checked inline before `startServer`); rewrite the catch block to the three-branch order above, exiting 1 for both startup branches.
3. **`src/config.ts`**: add the one-line stderr warning in the catch; keep behavior otherwise identical (defaults in memory, file untouched).
4. **`--help` text** (`src/cli-args.ts`): add an `Environment: JANUS_DEBUG=1  print stack traces on failure` line.

## Tests

- `src/startup-errors.test.ts` (new): `EADDRINUSE`-shaped error + port → message mentions the port and `--port`; unknown error → `null`; `JANUS_DEBUG` toggles stack inclusion (set/restore env in the test).
- `src/config.test.ts`: extend the existing corrupt-config case to assert the stderr warning fires (spy on `process.stderr.write`) and the file is not rewritten.
- Manual check: `janus --port=<busy>` against a second running instance shows the friendly message and exits 1.

Run `./scripts/run.mjs check-diff` after the change.
