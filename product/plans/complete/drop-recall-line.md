# Drop the shell plugin's unused recallLine helper

**Complexity: 1/10** — delete a function and the two cases covering it, narrow one export, correct one sentence of prose.

**Goal.** Remove `recallLine` and stop its test passing for a function nothing calls. It was exported from `web/src/plugins/shell/command-line-rules.ts` and referenced only by its own test file; the walk the tab actually performs is the one `useCommandBarKeys` does from its `history` prop. The plan also named the history walk as one of that module's pure functions, which is how the dead code looked accounted for.

**Approach.** Delete it and narrow `CONTROL_KEYS`, which had no external consumer either. Correct the plan sentence to name the walk as the published hook's, which is what it is. The remaining rules — `routeFor`, `shellLine`, `controlCharacterFor` — are used by `ShellTab` and keep their cases.

## Implementation

1. Delete `recallLine` from `web/src/plugins/shell/command-line-rules.ts` and its two cases from the test file.
2. Make `CONTROL_KEYS` module scope rather than exported, saying why in the comment already there.
3. Correct the `Files and folders` sentence in `product/plans/complete/shell-tab.md`.

## Tests

The two deleted cases covered a function that did not run. What actually walks the history is covered where it runs: `web/src/plugins/shell/ShellTab.test.tsx` asserts `Up` and `Down` over the sent lines and their order, and that a claimed line is not among them. Those cases are untouched and are the real coverage.

## Out of scope

- `useCommandBarKeys` and `useCommandHistoryRecall`, which are shared with every agent tab and are correct as they are.
- Any change to the shell tab's recall behavior, which does not change.