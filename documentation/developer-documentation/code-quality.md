# Code quality

Two tools measure code quality: FTA (complexity scores per file) and ESLint sonarjs (cognitive complexity per function, surfaced inline during lint).

## Running the report

```bash
npm run quality        # ranked complexity table for src/ and web/src/
npm run quality:gate   # same, but exits non-zero if any file exceeds the score cap
```

Both commands print a score-sorted table for each area:

```
┌──────────────────┬────────────┬─────────────────────┬────────────────────┐
│ File             │ Line count │ FTA score           │ Assessment         │
├──────────────────┼────────────┼─────────────────────┼────────────────────┤
│ controller.ts    │ 815        │ 94.30               │ Needs improvement  │
│ tab.ts           │ 200        │ 60.26               │ Needs improvement  │
│ schedule.ts      │ 183        │ 59.59               │ Could be better    │
└──────────────────┴────────────┴─────────────────────┴────────────────────┘
```

## Reading the FTA score

| Score | Assessment | Meaning |
| ----- | ---------- | ------- |
| < 50 | OK | Low risk; leave it alone unless you're already in the file. |
| 50–75 | Could be better | Worth decomposing when you next touch it. |
| 75–95 | Needs improvement | Active refactoring target; add tests before changing. |
| > 95 | _(blocked)_ | Exceeds the regression gate — the score cap in `fta.json` prevents scores this high from landing. |

The score combines cyclomatic complexity, Halstead volume, and line count. A high score means the file is both large and branchy — the highest-leverage refactoring targets. `controller.ts` (94.3) is the current outlier; see `fta/` for the full per-file baseline.

## Regression gate

`fta.json` sets `score_cap: 95`. `npm run quality:gate` exits non-zero if any file's score exceeds it, blocking regressions in CI. Ratchet the cap down as high-scoring files are decomposed — the mirror of the coverage threshold ratchet.

## Complexity warnings in lint

`npm run lint` also reports cognitive complexity per function via `eslint-plugin-sonarjs`. Functions above 15 get a warning with an exact line number:

```
src/controller.ts
  706:11  warning  Refactor this function to reduce its Cognitive Complexity
                   from 30 to the 15 allowed  sonarjs/cognitive-complexity
```

These are warnings, not errors — they surface during normal development without blocking CI. Resolve them by extracting the flagged function into smaller helpers.

## Refreshing the baseline

After intentional complexity work, commit an updated snapshot:

```bash
npm run quality:snapshot
```

This rewrites `fta/baseline-server.json` and `fta/baseline-client.json`, which track the per-file trend over time.
