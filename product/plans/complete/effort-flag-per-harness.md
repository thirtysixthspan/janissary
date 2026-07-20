# Translate --effort to each harness's own flag

**Complexity: 3/10** — a single command-builder function gains a per-harness effort mapping, plus updates to the two tests that encoded the old one-size-fits-all `--effort` and to the harness spec's effort section.

## Root cause

`buildHarnessCommand` (`src/harness/index.ts`) always emits `--effort '<level>'` for every harness:

```ts
if (effort) parts.push(`--effort ${shellQuote(effort)}`);
```

But `--effort` is a claude-only flag. codex and opencode reject the unknown argument and exit immediately, which closes the freshly opened harness tab. Verified against the installed binaries:

- `codex --effort high` → `error: unexpected argument '--effort' found` (exit non-zero).
- `opencode --effort high` → prints its usage/help and exits with code 1 (yargs strict mode rejects the unknown flag).
- `claude --effort high` → accepted (`--effort <level>` is a real claude flag: low, medium, high, xhigh, max).

The harness spec (`product/specs/harness.md`) compounds the confusion by claiming "a harness binary that doesn't understand the flag ignores it" — codex and opencode do not ignore it, they fail.

## Correct behavior

An effort level requested at launch must be expressed through whatever flag the target harness actually understands, so the launch never breaks:

- **claude** — `--effort <level>` (unchanged).
- **codex** — set via a config override: `-c model_reasoning_effort=<level>`. Verified `codex -c model_reasoning_effort=high` is accepted.
- **opencode** — has no effort/reasoning CLI flag at all, so no effort argument is emitted; the value is silently dropped rather than passed as a flag opencode would choke on.

`--model` is unaffected — all three harnesses take `-m/--model` verbatim, so its handling stays as-is.

## Reproduction

`buildHarnessCommand` is the seam. Before the fix:

- `buildHarnessCommand('codex', undefined, 'high')` → `codex --effort 'high'`; running that binary errors with `unexpected argument '--effort'`.
- `buildHarnessCommand('opencode', 'opencode-go/deepseek-v4-pro', 'high')` → `opencode --model '…' --effort 'high'`; running that prints help and exits 1.

At the app level, `harness codex --effort high` / `harness opencode --effort high` open a tab whose PTY exits at once, so the tab closes immediately instead of running the harness.

## Approach

Replace the unconditional `--effort` line in `buildHarnessCommand` with a small per-harness `effortArg(name, effort)` helper that returns the correct fragment (or nothing) for each harness. Keep the model handling exactly as it is. No change to command parsing, the manager, the launch dialog, or the effort chip — the parsed/threaded effort value is unchanged; only how it is rendered into the shell command differs.

## Implementation steps

1. **`src/harness/index.ts`** — add an `effortArg(name: string, effort: string): string | undefined` helper mapping each harness to its effort surface: `claude` → `--effort <quoted level>`, `codex` → `-c <quoted model_reasoning_effort=level>`, any other harness (opencode) → `undefined`. In `buildHarnessCommand`, replace the `if (effort) parts.push(...)` line with a push of `effortArg(name, effort)` only when it is defined. Update the function's doc comment (which currently shows opencode getting `--effort`) to describe the per-harness translation.

## Tests

Test-first: the existing `buildHarnessCommand` and manager assertions encode the buggy behavior, so updating them to the correct expectations makes them fail against current code, then pass with the fix.

- **`src/harness/index.test.ts`** (`buildHarnessCommand` describe):
  - Keep the claude `--effort 'high'` assertion.
  - Change the "both --model and --effort" opencode case to assert effort is dropped: `buildHarnessCommand('opencode', 'opencode-go/deepseek-v4-pro', 'high')` → `opencode --model 'opencode-go/deepseek-v4-pro'`.
  - Add a codex case: `buildHarnessCommand('codex', undefined, 'high')` → `codex -c 'model_reasoning_effort=high'`, and a codex model+effort case → `codex --model 'gpt-5' -c 'model_reasoning_effort=high'`.
- **`src/harness/manager.test.ts`** (`HarnessManager model/effort` describe): update the "passes a valid --model and --effort through" opencode case so the spawned command is `opencode --model 'opencode-go/glm-5.2'` (effort no longer appended). The claude-only, profile-effort, and payload-chip cases are unchanged — the effort value still rides on the harness payload for the metadata chip regardless of harness.

## Out of scope

- The effort chip in the metadata row still shows the requested value on an opencode tab even though opencode applies no effort — that is the user's stated intent at launch and is not part of the reported launch failure.
- Validating effort levels against what each harness accepts (e.g. codex has no `xhigh`/`max`) — the spec keeps effort unvalidated and forwarded verbatim.
- `--model` handling and model-catalog validation.
- The New harness launch dialog and profile schema — both feed the same `effort` value through unchanged.
