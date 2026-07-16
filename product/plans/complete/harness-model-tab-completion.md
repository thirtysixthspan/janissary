# Tab-complete `harness --model <name>`

**Complexity: 3/10** — one new completion handler following an existing near-identical
precedent (`completeSyntaxTheme`), wired into the shared dispatcher, plus tests. No new
architecture, no web-side changes (completion is entirely server-side).

## Goal

When typing a `harness <name> ... --model <partial>` command line, pressing Tab completes
the model name against the harness's known catalog in `harness-models.json` — the same way
`syntax theme <partial>` already completes against `SYNTAX_THEMES`. A single match fills in
fully (with a trailing space); multiple matches fill in their longest common prefix and are
offered as `matches`.

## Approach

`src/completion/index.ts` (`completeCommandLine`) already dispatches to per-command handlers
in `src/completion/handlers.ts`, each tried in an `??` chain. Add one more handler,
`completeHarnessModel`, that:

- Only applies when `command === 'harness'`.
- Detects the cursor sits right after a `--model` flag by checking `preceding.at(-1)` — the
  same technique `completeScheduleTarget` uses for `in <tab>`. This is necessary (rather than a
  fixed argument index) because `harness`'s flags (`as <label>`, `-w`, `--offline`, `-y`,
  `--model`, `--effort`) can appear in any order after the harness name (see
  `parseHarnessCommand` in `src/harness/index.ts`).
- Reads the harness name from `preceding[1]` — always the second token, since
  `parseHarnessCommand` requires the harness name immediately after `harness`.
- Completes against `modelsFor(harnessName)` from `src/harness/models.ts` (already backs the
  `--model` validation in `src/harness/manager.ts`), reusing `completeWord` from
  `src/completion/helpers.ts`.
- Returns `null` for unknown harness names (`modelsFor` already returns `[]` for those, so
  `completeWord` naturally yields no matches).

## Implementation steps

1. **`src/completion/handlers.ts`** — add:
   ```ts
   import { modelsFor } from '../harness/models.js';

   // Complete `harness <name> ... --model <partial>` against the harness's known model catalog.
   // The flag can appear anywhere after the harness name, so match on the token immediately
   // preceding the cursor rather than a fixed argument index (mirrors completeScheduleTarget).
   export function completeHarnessModel(
     command: string,
     preceding: string[],
     token: string,
     before: string,
     after: string,
     tokenStart: number,
   ): CompletionResult | null {
     if (command !== 'harness' || preceding.at(-1)?.toLowerCase() !== '--model') return null;
     const harnessName = preceding[1]?.toLowerCase();
     if (!harnessName) return null;
     return completeWord(token, '', modelsFor(harnessName), ' ', before, after, tokenStart);
   }
   ```
2. **`src/completion/index.ts`** — import `completeHarnessModel` and add it to the `??` chain
   (alongside the other handlers, before the file-path fallback):
   ```ts
   completeHarnessModel(command, preceding, token, before, after, tokenStart) ??
   ```

## Tests

- **`src/completion/handlers.test.ts`** — new `describe('completeHarnessModel', ...)` block:
  - Completes a single match: `completeHarnessModel('harness', ['harness', 'claude', '--model'], 'claude-op', 'harness claude --model claude-op', '', 24)` → `newInput` ends with `claude-opus-4-8 `.
  - Completes multiple matches to their longest common prefix: partial `claude-` under the
    `claude` harness → `matches` includes all four `claude-*` entries.
  - Returns `null` for a non-`harness` command.
  - Returns `null` when the preceding token is not `--model` (e.g. mid-typing the harness name).
  - Returns `null` for an unknown harness name (no matches).
- **`src/completion/index.test.ts`** — one integration-level test through `completeCommandLine`
  confirming a full `harness claude --model claude-s` line completes to
  `harness claude --model claude-sonnet-5 `, mirroring the existing `syntax theme` test.

## Out of scope

- Completing the harness *name* itself (first argument) — the issue is specifically about
  models; harness names are a short fixed list (`claude`/`opencode`/`codex`) typed once per
  command and not the reported pain point.
- Completing `--effort <level>` — effort levels are passed through unvalidated with no fixed
  catalog to complete against (per `parseHarnessCommand`'s doc comment).

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks, runs the
  affected server tests.
- Manual: not practical to drive the interactive PTY command line in this environment; covered
  by the unit and integration tests above instead.
