# Development Guide for Claude Code

## Verifying changes

This project uses two complementary commands for checking code:

### During development — `npm run check:diff` (fast)

After each change, run **`npm run check:diff`** for fast feedback:

- **Lints** only the files you changed
- **Typechecks** the affected project(s) incrementally (fast on repeated runs)
- **Tests** related tests from the affected area(s):
  - Server tests (`test:diff:server`) if `src/` files changed
  - Web tests (`test:diff:web`) if `web/src/` files changed
  - Both if changes touch both areas

This completes in seconds and is meant for the inner development loop. `check:diff` is scoped to the uncommitted working tree; committing or reverting mid-task rescopes it automatically.

### At the very end — `npm run check` (full gate)

When all work is complete, run the full **`npm run check`** exactly once. It adds:

- Full CSS linting (`stylelint`)
- Code complexity checks (`fta`)
- Duplication detection (`jscpd`)
- Dead export detection (`knip`)
- Full test suite (all tests, all projects)
- Coverage thresholds

This is the actual gate; `check:diff` is a speed optimization for development, not a substitute.

## Why two commands?

- **`check:diff`** is designed to be run dozens of times while working (after each edit).
- **`check`** is thorough but slow; running it after every change kills developer velocity.
- Using both together gives fast feedback during development + comprehensive assurance before shipping.

## Project structure

- `src/` — Server (Node.js, CLI, terminal UI)
- `web/src/` — Web UI (React, Vite)
- `src/**/*.test.ts` — Server tests
- `web/src/**/*.test.tsx` — Web tests (currently no tests in web/)
