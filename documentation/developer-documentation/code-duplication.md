# Code duplication

Detect copy-pasted code blocks across `src/` and `web/src/` with [jscpd](https://github.com/kucherenko/jscpd). Test files are excluded so the metric reflects production duplication only.

```bash
npm run duplication        # print all clones and the overall duplication %
npm run duplication:gate   # same, but exits non-zero if duplication exceeds the threshold
```

## Reading the output

Each clone block names the two file locations that match:

```
Clone found (typescript)
 - commands/state.ts [11:64 - 34:58]
   state-format.ts [4:57 - 24:115]
```

The summary table at the end shows the total picture:

```
┌────────────┬────────────────┬─────────────┬──────────────┬──────────────┬──────────────────┐
│ Format     │ Files analyzed │ Total lines │ Total tokens │ Clones found │ Duplicated lines  │
├────────────┼────────────────┼─────────────┼──────────────┼──────────────┼──────────────────┤
│ typescript │ 64             │ 5469        │ 42226        │ 12           │ 152 (2.78%)       │
└────────────┴────────────────┴─────────────┴──────────────┴──────────────┴──────────────────┘
```

The Duplicated lines % is the key number. Under 3% is acceptable for this codebase; the gate enforces that ceiling.

## Regression gate

`.jscpd.json` sets `threshold: 3`. `npm run duplication:gate` exits non-zero if the duplication percentage exceeds it, blocking regressions in CI. Ratchet the threshold down toward 2% as clones are removed.

Configuration lives in `.jscpd.json`. The minimum clone size is 5 lines / 50 tokens — shorter matches are noise, not duplication.
