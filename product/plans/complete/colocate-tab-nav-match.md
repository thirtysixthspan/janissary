# Colocate the tab-nav matching module into the pickers feature

## Complexity

2/10 — two source files plus one test file move, and five importers rewrite; no behavior change.

## Goal

`web/src/tab-nav-match.ts` — the tab-nav picker's `filterTabs`, `displayLabel`, and `TabNavEntry` — lives at the app root while four of its five consumers are in `web/src/pickers/` and one is the app shell. Colocate it into `web/src/pickers/`, leaving only the app shell reaching into it.

## Approach

Move `web/src/tab-nav-match.ts` and its colocated `web/src/tab-nav-match.test.ts` into `web/src/pickers/` unchanged in content. Update the three pickers imports to `./tab-nav-match` from their current `../tab-nav-match`, and `web/src/keyboard-handlers.ts` to `./pickers/tab-nav-match`. `web/src/keyboard-handlers.test.ts` imports only the `TabNavEntry` type from `./tab-nav-match` and must be retargeted to `./pickers/tab-nav-match` as well (the item's expectation that it needs no change does not hold for its type import — a one-line specifier rewrite, no assertion change).

## Implementation

1. `git mv` the two files to `web/src/pickers/`.
2. Retarget the five importers.
3. Run `./scripts/run.mjs check-diff` after the move and again after the rewrites.

## Tests

No new tests — a pure move. `web/src/pickers/tab-nav-match.test.ts` keeps passing with its own relative specifier intact; `keyboard-handlers.test.ts` keeps passing with the retargeted type import.

## Out of scope

- Any behavior change to the matching rules.
