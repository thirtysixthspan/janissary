# CLI: reject malformed and unknown arguments

## Goal

`janus` exits with code 2 and a one-line pointer to `--help` when given an argument it does not understand, instead of silently ignoring it and booting the server. Today (`src/main.ts:99-102`):

- A typo like `--no-opne` is dropped — the app window opens even though the user asked it not to.
- `--port=abc` becomes `Number('abc')` → `NaN`, which flows into `startServer({ port: NaN })` (`src/index.ts:29`) and whatever `http.Server.listen` does with it, rather than failing at the boundary.
- A bare `--port` (no value) never matches the `startsWith('--port=')` scan and is silently ignored.
- Positional arguments (`janus foo`) are ignored.

```
$ janus --no-opne
janus: unknown option '--no-opne'
Try 'janus --help' for more information.
$ echo $?
2
```

## Design decisions

**Depends on [cli-help-version.md](cli-help-version.md).** That plan introduces `src/cli-args.ts` with `parseArgs`; this plan flips it to `strict: true` and adds validation. They can land as one change — the split exists so each concern is reviewable on its own.

**`strict: true` + `allowPositionals: false` does most of the work.** `parseArgs` then throws `ERR_PARSE_ARGS_UNKNOWN_OPTION` / `ERR_PARSE_ARGS_INVALID_OPTION_VALUE` with a decent message. Catch in `parseCliArgs`, rethrow as a dedicated `CliUsageError` carrying the cleaned-up message, so the caller can distinguish "bad invocation" from "boot failed".

**Port validation happens in `parseCliArgs`, not in `boot()`.** After parsing, `--port` must be an integer in 1–65535; otherwise throw `CliUsageError('invalid --port value: <raw>')`. `startServer` keeps its current trusting signature — the CLI boundary is where user input gets checked.

**Exit code 2 for usage errors, 1 for boot failures.** This is the conventional split (and best-practice #24, meaningful exit codes): scripts wrapping `janus` can tell "I called it wrong" from "it failed to start". The existing catch-all at `src/main.ts:130-135` exits 1 for everything; add a `CliUsageError` branch that prints the message + the `--help` hint to stderr and exits 2. This dovetails with [actionable-startup-errors.md](actionable-startup-errors.md), which restructures that catch block — coordinate if both are in flight.

**`--relaunch` stays a supported flag even though it's launcher-internal.** The server passes it when respawning; strict mode must keep accepting it. Do not document it as removed.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| `parseCliArgs` / `parseArgs` config (from the help/version plan) | `src/cli-args.ts` |
| Ad-hoc scan being replaced | `src/main.ts:99-102` |
| Top-level catch that maps errors to exit codes | `src/main.ts:130-135` |
| `port` consumer (unchanged) | `src/index.ts:29` (`startServer`) |

## Implementation

1. **`src/cli-args.ts`**: set `strict: true, allowPositionals: false`. Define `export class CliUsageError extends Error {}`. Wrap the `parseArgs` call in try/catch; on any `ERR_PARSE_ARGS_*` error rethrow `new CliUsageError(message)` where `message` strips Node's `TypeError [ERR_...]:` prefix down to the human part. Validate `port`: `Number.isInteger(n) && n >= 1 && n <= 65535`, else `CliUsageError`.
2. **`src/main.ts`** top-level catch: `if (error instanceof CliUsageError) { stderr(error.message + "\nTry 'janus --help' for more information.\n"); process.exit(2); }` before the generic branch. Note the catch wraps `boot()` — parse must happen inside `boot()` (it already will, per the help/version plan) for the error to reach it.
3. **`bin/janus.mjs`**: no change — it already forwards `result.status ?? 1`, so exit 2 propagates through the launcher.

## Tests

Extend `src/cli-args.test.ts`:

- Unknown flag (`--no-opne`), bare `--port`, `--port=abc`, `--port=0`, `--port=70000`, and a positional (`['foo']`) each throw `CliUsageError` (assert with `expect(...).toThrow(CliUsageError)` — don't assert on Node's message text, per the no-locale-trust practice; asserting on our own port message is fine).
- `--port=3000` and the full valid flag set still parse cleanly under strict mode.
- `--relaunch` is still accepted.

Run `./scripts/run.mjs check-diff` after the change.
