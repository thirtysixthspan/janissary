# Development Guide for Claude Code

## ESLint rules

Before writing code, review [`eslint.config.mjs`](eslint.config.mjs) to understand the linting rules that apply. Write code on the first pass that conforms to these rules to avoid rework:

- **Type-aware rules** (`src/**/*.ts`, `src/**/*.tsx`, `web/src/**/*.ts`, `web/src/**/*.tsx`): `@typescript-eslint/prefer-nullish-coalescing`, `@typescript-eslint/no-unnecessary-type-assertion`, `@typescript-eslint/no-unsafe-assignment`, `@typescript-eslint/no-unsafe-member-access`
- **Security rules** (`src/` and `web/src/`): `security/detect-unsafe-regex`, `security/detect-eval-with-expression`
- **Code complexity** (`src/` and `web/src/`): `sonarjs/cognitive-complexity` (warn, limit ~15), `sonarjs/no-duplicate-string` (warn)
- **File size limit**: `max-lines` max 200 lines (skipping blanks/comments) — extract into new modules rather than compacting code
- **Import extensions** (`src/`): NodeNext style — relative imports must carry `.js` (and `.json`), never `.ts`/`.tsx`

## Verifying changes

### ✅ AI workflow — use these commands while developing

**Always use the fast diff-scoped commands** after each change:

```bash
node scripts/run.mjs lint-files   # lint changed files
npm run typecheck:diff             # typecheck affected projects (incremental)
npm run test:diff:server           # server tests for changes
npm run test:diff:web              # web tests for changes
node scripts/run.mjs check-diff   # orchestrator: runs all four above concurrently
```

Pick the one(s) you want, or just run **`node scripts/run.mjs check-diff`** which automatically:

- Lints only the files you changed
- Typechecks the affected project(s) incrementally (fast on repeated runs)
- Tests related tests from the affected area(s):
  - Server tests if `src/` files changed
  - Web tests if `web/src/` files changed
  - Both if changes touch both areas

This completes in seconds and is the entire development loop. `check-diff` is scoped to the uncommitted working tree; committing or reverting mid-task rescopes it automatically.

### ❌ `npm run check` — HUMANS ONLY

**Do NOT run `npm run check` while developing.** This is the end-of-work gate meant only for humans or CI:

- Slow: lints all files, typechecks both full projects, runs the entire test suite
- Coverage thresholds enforced
- Also adds CSS linting, code complexity checks, duplication detection, dead code scanning

**Leave it for the human to run exactly once, after all work is complete.** If you run it while iterating, it wastes time and blocks the human's workflow.

## Summary

| Command | When | Who | Speed |
| --- | --- | --- | --- |
| `node scripts/run.mjs check-diff` | After each change | AI (always) | ~10-40s |
| `npm run check` | Once, end of work | Human only | ~2min |

## Capturing command output

**Never re-run a slow command multiple times to filter its output differently.** Capture once, filter as needed:

```bash
# ❌ Antipattern — runs npm 3 times
npm run lint 2>&1 | grep "sonarjs"
npm run lint 2>&1 | grep "buffer.ts"
npm run lint 2>&1 | tail -3

# ✅ Correct — run once, filter repeatedly
output=$(npm run lint 2>&1)
echo "$output" | grep "sonarjs"
echo "$output" | grep "buffer.ts"
echo "$output" | tail -3
```

This applies to any slow command: lint, typecheck, test runs, builds. Capture to a variable (or scratchpad file for very large output), then grep/filter the captured result.

## Plan and task formatting

When writing implementation plans or creating tasks, use natural line breaks only — do not artificially wrap lines at a fixed column width. Let long lines flow naturally so content remains readable in any viewport.

## Code guidelines

Follow the conventions in [`CODE_GUIDELINES.md`](CODE_GUIDELINES.md), including the
file-size limit and how to respond to it (extract code into a new module — never compact
code, strip comments, or delete spacing to get under the limit).

## Running scripts

Use `node scripts/run.mjs <name>` to run any script in `scripts/`. This is the only way to invoke scripts — it is pre-approved in `.claude/settings.json` so no permission prompt is needed.

```bash
node scripts/run.mjs pr-merge-to-master   # runs scripts/pr-merge-to-master.sh
node scripts/run.mjs check-diff           # runs scripts/check-diff.mjs
node scripts/run.mjs                      # lists all available scripts
```

All scripts in `scripts/` are considered trusted. Do not invoke them directly with `bash scripts/foo.sh` or `node scripts/foo.mjs` — use the runner so the single permission covers everything.

## Project structure

- `src/` — Server (Node.js, CLI, terminal UI)
- `web/src/` — Web UI (React, Vite)
- `src/**/*.test.ts` — Server tests
- `web/src/**/*.test.tsx` — Web tests (currently no tests in web/)
