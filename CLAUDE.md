# Development Guide for Claude Code

## Verifying changes

### ✅ AI workflow — use these commands while developing

**Always use the fast diff-scoped commands** after each change:

```bash
npm run lint:diff           # lint changed files
npm run typecheck:diff      # typecheck affected projects (incremental)
npm run test:diff:server    # server tests for changes
npm run test:diff:web       # web tests for changes
npm run check:diff          # orchestrator: runs all four above concurrently
```

Pick the one(s) you want, or just run **`npm run check:diff`** which automatically:

- Lints only the files you changed
- Typechecks the affected project(s) incrementally (fast on repeated runs)
- Tests related tests from the affected area(s):
  - Server tests if `src/` files changed
  - Web tests if `web/src/` files changed
  - Both if changes touch both areas

This completes in seconds and is the entire development loop. `check:diff` is scoped to the uncommitted working tree; committing or reverting mid-task rescopes it automatically.

### ❌ `npm run check` — HUMANS ONLY

**Do NOT run `npm run check` while developing.** This is the end-of-work gate meant only for humans or CI:

- Slow: lints all files, typechecks both full projects, runs the entire test suite
- Coverage thresholds enforced
- Also adds CSS linting, code complexity checks, duplication detection, dead code scanning

**Leave it for the human to run exactly once, after all work is complete.** If you run it while iterating, it wastes time and blocks the human's workflow.

## Summary

| Command | When | Who | Speed |
| --- | --- | --- | --- |
| `npm run check:diff` | After each change | AI (always) | ~10-40s |
| `npm run check` | Once, end of work | Human only | ~2min |

## Code guidelines

Follow the conventions in [`CODE_GUIDELINES.md`](CODE_GUIDELINES.md), including the
file-size limit and how to respond to it (extract code into a new module — never compact
code, strip comments, or delete spacing to get under the limit).

## Project structure

- `src/` — Server (Node.js, CLI, terminal UI)
- `web/src/` — Web UI (React, Vite)
- `src/**/*.test.ts` — Server tests
- `web/src/**/*.test.tsx` — Web tests (currently no tests in web/)
