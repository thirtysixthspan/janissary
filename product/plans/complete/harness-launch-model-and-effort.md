# Choose a model and effort level when launching a harness

**Complexity: 3/10** — small, well-precedented additions to an existing parse/spawn pipeline on the server side only (no client/protocol changes); correctness depends on threading two new optional values through several existing call sites correctly, and on the newly-added model-validation call site below.

## Summary

Today, only `profile launch` can open a harness tab with a `model` selected (passed verbatim to the harness binary's `--model` flag); the interactive `harness <name>` command has no way to pick a model or an effort level at all. This feature adds `--model <name>` and `--effort <level>` flags to the interactive `harness <name>` command, and a matching `effort` field to profile harness entries (alongside the existing `model` field), so both launch paths — typed command and profile — can select a model and an effort level the same way.

## Design decisions

1. **Scope: both launch paths.** `--model`/`--effort` are added to the interactive `harness <name>` command, and profile harness entries gain a new `effort` field alongside the existing `model` field, keeping the two paths symmetric — anything expressible in a profile should also be expressible by typing the command directly.
2. **Delivery mechanism: CLI flag, like model.** `--effort <level>` is passed as a literal flag to the harness binary via `buildHarnessCommand`, the same way `--model` is today — not as an environment variable. This is a deliberate departure from the existing `CLAUDE_THINKING_EFFORT` env-var mechanism used by ACP monitor sessions (`src/monitor/acp.ts`), which is a separate subsystem (persona-driven monitoring sessions, not PTY-launched harness tabs) and is out of scope for this change.
3. **Validation: pass-through, no catalog.** Unlike `model` (validated against `harness-models.json` for harnesses with a populated catalog), `--effort`'s value is passed through verbatim with no validation against a fixed set — matching how `model` already behaves for harnesses whose catalog is empty (claude, codex today).
4. **Harness support: all harnesses, best-effort.** `--effort` is accepted for any harness name and forwarded to the binary; a harness that doesn't understand the flag simply receives (and likely ignores) it, the same way opencode already ignores a persona's `variant` today. There is no claude-only restriction the way `-y`/`--yes` has one.
5. **`--model` on the interactive command is validated, matching profile launch.** Today `parseHarnessCommand` (`src/harness/index.ts`) has no `--model` support at all, so there is no existing model validation on the interactive path to preserve — only `openHarnessEntry` (`src/profile/agent-opener.ts:61-63`) validates `entry.model` against `isKnownModel`, and only for profile launch. Decision 1's symmetry goal means the new interactive `--model` flag gets the same validation: `HarnessManager.run()` checks `isKnownModel(parsed.name, parsed.model)` immediately after a successful `parseHarnessCommand` call and before dispatching to `open()`, returning the identical error text agent-opener.ts already uses (`` `Unknown model "${model}" for harness "${name}" — add it to harness-models.json.` ``) so the message is consistent regardless of launch path. Since `harness-models.json` today only populates opencode's catalog, `harness claude --model anything` will always error — the same limitation profile launch already has for claude/codex, not a new one introduced here.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `parseHarnessCommand` | `src/harness/index.ts` | Parses `harness <name> [as <label>] [-w] [--offline] [-y]`; needs new `--model <name>` and `--effort <level>` token handling, following the same `some((t) => ...)`/indexed-lookup pattern already used for `as <label>`. |
| `buildHarnessCommand` | `src/harness/index.ts` | Already builds the shell command with an optional `model` argument (`buildHarnessCommand(name, model)`); needs a second optional `effort` argument appended as its own `--effort <value>` flag, shell-quoted the same way. |
| `HarnessManager.open` / `spawnTab` | `src/harness/manager.ts` | `open()` currently takes `(name, workspace, offline, autoApprove, label)` with no model/effort; `spawnTab` already threads an optional `model` through to `buildHarnessCommand` from the profile path — needs `effort` threaded the same way from both `open()` and `openFromProfile()`. |
| `isKnownModel` / `harness-models.json` | `src/harness/models.ts` | Today this is called only from `openHarnessEntry` (profile launch) — **not** from the interactive `harness <name>` command, which has no `--model` flag to validate yet. Per decision 5, the new `--model` flag on the interactive command reuses this same function; effort deliberately does not get an equivalent catalog per decision 3. |
| `ProfileHarnessEntry` type | `src/types.ts` | Has a `model?: string` field read by `openHarnessEntry`/`openFromProfile`; needs a sibling `effort?: string` field, documented and validated the same way `model` is (skip-and-report on an actual error, not on an unknown value since there's no catalog to check against). |
| `openHarnessEntry` | `src/profile/agent-opener.ts:56-74` | Validates `entry.model` against `isKnownModel` at `:61-63` (`Unknown model "${entry.model}" for harness "${entry.harness}" — add it to harness-models.json.`) and reports/skips on failure; needs to read `entry.effort` and pass it through with no equivalent validation call, per decision 3. This exact error string is reused verbatim for the interactive path's new validation (decision 5). |
| `HarnessManager` test mock | `src/harness/manager.test.ts:43-47` | `pty.spawn` is currently mocked as a plain arrow function (`spawn: () => 'pty-1'`), not a `vi.fn()` — it records no calls. A test asserting that `model`/`effort` reached the spawned command needs this upgraded to `vi.fn(() => 'pty-1')` so `toHaveBeenCalledWith(...)` can inspect the command string argument. |

## Proposed changes

1. **`src/harness/index.ts`**: extend `parseHarnessCommand`'s token parsing to recognize `--model <value>` and `--effort <value>` anywhere among the trailing tokens (alongside `-w`, `--offline`, `-y`, `as <label>`), adding `model?: string` and `effort?: string` to the `HarnessParsed` name-branch shape. A `--model`/`--effort` with no following value is a usage error, matching the existing `as <label>` missing-argument handling. Extend `buildHarnessCommand` to accept an optional `effort` and append a shell-quoted `--effort <value>` segment when present, independent of whether `model` is also present.
2. **`src/harness/manager.ts`**: in `run()`, immediately after `parseHarnessCommand` returns a name-branch result (not `error`/`capture`), add the model-validation check from decision 5 — `if (parsed.model && !isKnownModel(parsed.name, parsed.model)) return` the unknown-model error string — before dispatching to `open()`. Thread `model` and `effort` through `run()` → `open()` → `spawnTab()` for the interactive command path (today only `openFromProfile` passes a `model` into `spawnTab`; `open()` does not, and has no parameters for either). `spawnTab`'s existing `model?: string` parameter gains a sibling `effort?: string` parameter, both forwarded into `buildHarnessCommand`. This makes `spawnTab`'s already-long positional parameter list (10 parameters today) one longer; keep it positional, consistent with the rest of the file's style — no signature refactor (e.g. an options object) is in scope for this change.
3. **`src/types.ts`**: add `effort?: string` to `ProfileHarnessEntry`, documented the same way `model` is.
4. **`src/profile/agent-opener.ts`**: `openHarnessEntry` reads `entry.effort` and passes it through to `openFromProfile`/`spawnTab` alongside `entry.model`, with no validation call for it (per decision 3).
5. **Spec updates**: `product/specs/harness.md`'s "Launching with a model" section is renamed/expanded to describe `--model`/`--effort` on the interactive command as well as profile launch, dropping the "This is not available from the interactive `harness <name>` command" caveat. `product/specs/profiles.md`'s entry-schema bullet list gains an `effort` bullet mirroring the existing `model` bullet, noting it has no validation.
6. **User documentation updates**:
   - `documentation/user-documentation/advanced-agents/harness.md`: document the new `--model <name>` and `--effort <level>` flags on the interactive `harness <name>` command (a new section, or an addition alongside the "Workspaces" `-w` coverage), including the updated usage string; note the model is validated against the harness's catalog (unknown-model error) while effort is passed through verbatim; and update the line that today reads "A harness launched by a profile can also be given a model and startup commands" (`:46`) so it no longer implies model/effort are profile-only.
   - `documentation/user-documentation/automation/profiles.md`: add the new `effort` field to the harness entry schema description, mirroring the existing `model` field and noting it has no validation.

## Tests

- `src/harness/index.test.ts` (alongside the existing `describe('parseHarnessCommand', ...)` and `describe('buildHarnessCommand', ...)` blocks, e.g. near the existing tests at `:59-153` and `:155-163`): `parseHarnessCommand` parses `--model <x>`, `--effort <y>`, and both together, in any order relative to other flags (`-w`, `-y`, `as <label>`); a bare `--model`/`--effort` with no following value returns a usage error. `buildHarnessCommand` includes a shell-quoted `--effort <value>` segment when given, with and without a model also present.
- `src/harness/manager.test.ts`: after upgrading the `pty.spawn` mock to a `vi.fn()` (see the "what already exists" table), assert `run()` rejects an unknown `--model` for a harness with a populated catalog (opencode) with the same error text `openHarnessEntry` already produces, before ever calling `pty.spawn`; assert a valid `--model`/`--effort` reaches the spawned command string via `open()`; assert `openFromProfile()` passes `entry.effort` through the same way `entry.model` already is.
- `src/profile/agent-opener.test.ts`: an entry with `effort` set opens successfully with no validation error, regardless of the value.

## Out of scope

- Any change to ACP monitor sessions' `CLAUDE_THINKING_EFFORT` env-var mechanism (`src/monitor/acp.ts`) or the persona `harness` directive's `variant` field — that remains a separate mechanism serving monitoring sessions, untouched by this change.
- Validating `--effort` against a fixed set of known levels.
- Restricting `--effort` (or `--model`) to specific harnesses the way `-y`/`--yes` is restricted to claude.
- Populating `harness-models.json` catalogs for claude/codex.
- Refactoring `spawnTab`'s (or `open`'s) positional parameter list into an options object — the new `effort` parameter is added positionally, consistent with the file's existing style.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Confirm the user documentation updates (`advanced-agents/harness.md`, `automation/profiles.md`) describe the `--model`/`--effort` flags, the updated usage string, and the new `effort` profile field; build the docs site (`npm run docs:build`) if the wording changed structurally.
- Manual check: run `harness opencode --model opencode-go/glm-5.2 --effort high` and confirm the spawned PTY's command line includes both flags with the given values; run `harness claude --effort high` alone (no model) and confirm only `--effort high` is appended; run `harness opencode --model not-a-real-model` and confirm it errors with the same "Unknown model" text profile launch already produces, with no tab opened; author a profile with a harness entry carrying `model` and `effort` fields, run `profile launch <name>`, and confirm the opened harness tab's spawned command includes both.
