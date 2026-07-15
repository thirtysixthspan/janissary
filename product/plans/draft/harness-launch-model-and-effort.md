# Choose a model and effort level when launching a harness

## Summary

Today, only `profile launch` can open a harness tab with a `model` selected (passed verbatim to the harness binary's `--model` flag); the interactive `harness <name>` command has no way to pick a model or an effort level at all. This feature adds `--model <name>` and `--effort <level>` flags to the interactive `harness <name>` command, and a matching `effort` field to profile harness entries (alongside the existing `model` field), so both launch paths — typed command and profile — can select a model and an effort level the same way.

## Design decisions

1. **Scope: both launch paths.** `--model`/`--effort` are added to the interactive `harness <name>` command, and profile harness entries gain a new `effort` field alongside the existing `model` field, keeping the two paths symmetric — anything expressible in a profile should also be expressible by typing the command directly.
2. **Delivery mechanism: CLI flag, like model.** `--effort <level>` is passed as a literal flag to the harness binary via `buildHarnessCommand`, the same way `--model` is today — not as an environment variable. This is a deliberate departure from the existing `CLAUDE_THINKING_EFFORT` env-var mechanism used by ACP monitor sessions (`src/monitor/acp.ts`), which is a separate subsystem (persona-driven monitoring sessions, not PTY-launched harness tabs) and is out of scope for this change.
3. **Validation: pass-through, no catalog.** Unlike `model` (validated against `harness-models.json` for harnesses with a populated catalog), `--effort`'s value is passed through verbatim with no validation against a fixed set — matching how `model` already behaves for harnesses whose catalog is empty (claude, codex today).
4. **Harness support: all harnesses, best-effort.** `--effort` is accepted for any harness name and forwarded to the binary; a harness that doesn't understand the flag simply receives (and likely ignores) it, the same way opencode already ignores a persona's `variant` today. There is no claude-only restriction the way `-y`/`--yes` has one.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `parseHarnessCommand` | `src/harness/index.ts` | Parses `harness <name> [as <label>] [-w] [--offline] [-y]`; needs new `--model <name>` and `--effort <level>` token handling, following the same `some((t) => ...)`/indexed-lookup pattern already used for `as <label>`. |
| `buildHarnessCommand` | `src/harness/index.ts` | Already builds the shell command with an optional `model` argument (`buildHarnessCommand(name, model)`); needs a second optional `effort` argument appended as its own `--effort <value>` flag, shell-quoted the same way. |
| `HarnessManager.open` / `spawnTab` | `src/harness/manager.ts` | `open()` currently takes `(name, workspace, offline, autoApprove, label)` with no model/effort; `spawnTab` already threads an optional `model` through to `buildHarnessCommand` from the profile path — needs `effort` threaded the same way from both `open()` and `openFromProfile()`. |
| `isKnownModel` / `harness-models.json` | `src/harness/models.ts` | Existing model validation for `harness <name>` and profile launch is unaffected; effort deliberately does not get an equivalent catalog per decision 3. |
| `ProfileHarnessEntry` type | `src/types.ts` | Has a `model?: string` field read by `openHarnessEntry`/`openFromProfile`; needs a sibling `effort?: string` field, documented and validated the same way `model` is (skip-and-report on an actual error, not on an unknown value since there's no catalog to check against). |
| `openHarnessEntry` | `src/profile/agent-opener.ts` | Validates `entry.model` against `isKnownModel` and reports/skips on failure; needs to read `entry.effort` and pass it through with no equivalent validation call, per decision 3. |

## Proposed changes

1. **`src/harness/index.ts`**: extend `parseHarnessCommand`'s token parsing to recognize `--model <value>` and `--effort <value>` anywhere among the trailing tokens (alongside `-w`, `--offline`, `-y`, `as <label>`), adding `model?: string` and `effort?: string` to the `HarnessParsed` name-branch shape. A `--model`/`--effort` with no following value is a usage error, matching the existing `as <label>` missing-argument handling. Extend `buildHarnessCommand` to accept an optional `effort` and append a shell-quoted `--effort <value>` segment when present, independent of whether `model` is also present.
2. **`src/harness/manager.ts`**: thread `model` and `effort` through `run()` → `open()` → `spawnTab()` for the interactive command path (today only `openFromProfile` passes a `model` into `spawnTab`; `open()` does not). `spawnTab`'s existing `model?: string` parameter gains a sibling `effort?: string` parameter, both forwarded into `buildHarnessCommand`.
3. **`src/types.ts`**: add `effort?: string` to `ProfileHarnessEntry`, documented the same way `model` is.
4. **`src/profile/agent-opener.ts`**: `openHarnessEntry` reads `entry.effort` and passes it through to `openFromProfile`/`spawnTab` alongside `entry.model`, with no validation call for it (per decision 3).
5. **Spec updates**: `product/specs/harness.md`'s "Launching with a model" section is renamed/expanded to describe `--model`/`--effort` on the interactive command as well as profile launch, dropping the "This is not available from the interactive `harness <name>` command" caveat. `product/specs/profiles.md`'s entry-schema bullet list gains an `effort` bullet mirroring the existing `model` bullet, noting it has no validation.

## Tests

- `src/harness/index.test.ts`: `parseHarnessCommand` parses `--model <x>`, `--effort <y>`, and both together, in any order relative to other flags (`-w`, `-y`, `as <label>`); a bare `--model`/`--effort` with no following value returns a usage error. `buildHarnessCommand` includes a shell-quoted `--effort <value>` segment when given, with and without a model also present.
- `src/harness/manager.test.ts`: `run()`/`open()` passes a parsed `--model`/`--effort` through to the spawned command (asserting on the command string or spawn args passed to the ptyManager); `openFromProfile()` passes `entry.effort` through the same way `entry.model` already is.
- `src/profile/agent-opener.test.ts`: an entry with `effort` set opens successfully with no validation error, regardless of the value.

## Out of scope

- Any change to ACP monitor sessions' `CLAUDE_THINKING_EFFORT` env-var mechanism (`src/monitor/acp.ts`) or the persona `harness` directive's `variant` field — that remains a separate mechanism serving monitoring sessions, untouched by this change.
- Validating `--effort` against a fixed set of known levels.
- Restricting `--effort` (or `--model`) to specific harnesses the way `-y`/`--yes` is restricted to claude.
- Populating `harness-models.json` catalogs for claude/codex.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: run `harness opencode --model opencode-go/glm-5.2 --effort high` and confirm the spawned PTY's command line includes both flags with the given values; run `harness claude --effort high` alone (no model) and confirm only `--effort high` is appended; author a profile with a harness entry carrying `model` and `effort` fields, run `profile launch <name>`, and confirm the opened harness tab's spawned command includes both.
