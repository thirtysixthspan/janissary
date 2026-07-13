# Checking changes

Two commands verify code during development:

## During development

Run after each change for fast feedback:

```bash
npm run check:diff          # lint + typecheck affected projects + related tests (orchestrator)
npm run lint:diff           # lint changed files only
npm run typecheck:diff      # typecheck affected projects (incremental)
npm run test:diff:server    # server tests related to changes
npm run test:diff:web       # web tests related to changes
```

`npm run check:diff` runs the orchestrator, which automatically lints changed files, typechecks affected projects incrementally, and runs tests from the affected area(s):

- Server tests only if `src/` files changed
- Web tests only if `web/src/` files changed
- Both if changes touch both areas

Completes in seconds. You can also run individual commands above if you want to focus on a specific check.

## At the end of work

Run once when all changes are complete:

```bash
npm run check        # full gate (humans only) — lint all, typecheck all, test all, plus complexity/duplication/dead code
```

This adds CSS linting, code complexity metrics, duplication detection, dead code scanning, the full test suite, and coverage thresholds. Use `check:diff` dozens of times while working, but run `check` only once, at the very end. AI developers should never run `check` — leave it for the human to verify before shipping.
