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
./scripts/run.mjs lint-files   # lint changed files
npm run typecheck:diff        # typecheck affected projects (incremental)
npm run test:diff:server      # server tests for changes
npm run test:diff:web         # web tests for changes
./scripts/run.mjs check-diff   # orchestrator: runs all four above concurrently
```

Pick the one(s) you want, or just run **`./scripts/run.mjs check-diff`** which automatically:

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
| `./scripts/run.mjs check-diff` | After each change | AI (always) | ~10-40s |
| `npm run check` | Once, end of work | Human only | ~2min |

## Capturing command output

**Never re-run a slow command multiple times to filter its output differently.** Capture once, filter as needed — and don't use shell variable capture (`output=$(...)`) to do it: that syntax can't be statically matched against the Bash allowlist and triggers a permission prompt on the very first call.

Instead, write the captured output to a file under `./temp/` using the **Write tool** (not a shell redirect), then filter that file with plain, redirect-free Bash commands — each one matches an allowlisted prefix (`grep *`, `tail *`, `cat *`, ...) and stays prompt-free:

```bash
# ❌ Antipattern — runs npm 3 times
npm run lint 2>&1 | grep "sonarjs"
npm run lint 2>&1 | grep "buffer.ts"
npm run lint 2>&1 | tail -3
```

```
✅ Correct
1. Run `npm run lint 2>&1` once via Bash, read its output from the tool result.
2. Use the Write tool to save that output to ./temp/lint.txt.
3. Filter it as many times as needed, each its own plain Bash call:
   grep "sonarjs" ./temp/lint.txt
   grep "buffer.ts" ./temp/lint.txt
   tail -3 ./temp/lint.txt
4. rm ./temp/lint.txt when done.
```

This applies to any slow command: lint, typecheck, test runs, builds.

## Avoid unnecessary file redirects in Bash calls

When a command's output just needs to be read or passed to the next step, do not redirect it to a file with `>`/`>>` and then `cat` it back in a separate call. The Bash tool already returns stdout/stderr directly in the tool result — reading a redirected file is redundant, and in permission-gated environments a redirect is a distinct file-write capability that isn't covered by an allowlisted command prefix, so it can trigger an approval prompt even when the command itself is pre-approved.

Instead:

- Just run the command and read its output from the tool result.
- If a later step needs the value, re-derive it (re-run the read-only command again) rather than stashing it in a file — shell variables don't persist across separate Bash calls anyway.
- Only write output to a file when a downstream command genuinely requires a file path as input (e.g. a script argument that must be a file, not stdin), or when you need to filter one slow command's output multiple ways (see [Capturing command output](#capturing-command-output)) — and prefer the Write tool for that, not a shell redirect.
- This applies to project workflow docs (`ai/*.md`, `docs/*.md`) too: if an example command shows `> file` followed by `cat file`, treat that as a mistake to fix, not a pattern to replicate.

## Plan and task formatting

When writing implementation plans or creating tasks, use natural line breaks only — do not artificially wrap lines at a fixed column width. Let long lines flow naturally so content remains readable in any viewport.

## Plan storage

Implementation plans live in `docs/plans/`, organized into folders by status. Each plan is a single markdown file; move the file between folders as its status changes:

- `docs/plans/draft/` — the plan itself is still being drafted and refined
- `docs/plans/ready/` — the plan is finalized and ready to implement
- `docs/plans/complete/` — the plan has been implemented
- `docs/plans/deferred/` — intentionally put on hold; not planned for near-term work

## Code guidelines

Follow the conventions in [`CODE_GUIDELINES.md`](CODE_GUIDELINES.md), including the
file-size limit and how to respond to it (extract code into a new module — never compact
code, strip comments, or delete spacing to get under the limit).

## Running scripts

Use `./scripts/run.mjs <name>` to run any script in `scripts/`. This is the only way to invoke scripts — it is pre-approved in `.claude/settings.json` so no permission prompt is needed.

```bash
./scripts/run.mjs pr-merge-to-master   # runs scripts/pr-merge-to-master.sh
./scripts/run.mjs check-diff           # runs scripts/check-diff.mjs
./scripts/run.mjs                      # lists all available scripts
```

All scripts in `scripts/` are considered trusted. Do not invoke them directly with `bash scripts/foo.sh` or `node scripts/foo.mjs` — use the runner so the single permission covers everything.

## Project structure

- `src/` — Server (Node.js, CLI, terminal UI)
- `web/src/` — Web UI (React, Vite)
- `src/**/*.test.ts` — Server tests
- `web/src/**/*.test.tsx` — Web tests (currently no tests in web/)
