# Make the Search Result Arrows Follow the Screen

**Complexity: 2/10** — one small pure module mapping the arrow keys onto the stacked-upward window, wired into the result selection hook, with unit and component tests.

## Goal

In the search tab's result window, `↑` should move the highlight up the page and `↓` should move it down the page. Today they do the opposite.

## What is wrong

The result window is a reversed column (`flex-direction: column-reverse` in `web/src/plugins/search/search.css`): row 0, the first match the scan found, sits at the bottom edge and each later row sits above it. `useResultSelection` (`web/src/plugins/search/useResultSelection.ts`) steps the selection with the host's shared `nextListSelection` from `web/src/shared/list-selection.ts`, which assumes a list that reads top-down: `ArrowDown` moves to the next index and `ArrowUp` to the previous. In a reversed column the next index is the row *above*, so `↓` climbs the page and `↑` descends it.

## Approach

Keep the shared rule untouched. It is right for every other plugin list, and all of them read top-down. The search tab supplies its own step function instead, the same way it already supplies its own click rule (`clickOpens`). The step function swaps `ArrowUp` and `ArrowDown` before handing the key to `nextListSelection`, so the ends still clamp rather than wrap and an empty list still has no selection.

The step function is a pure function in its own module, `web/src/plugins/search/result-keys.ts`, so it can be tested without rendering. The hook passes it to `selection.navigate` in place of `nextListSelection`.

`Home` and `End` are left alone. `Home` goes to the first match and `End` to the last, which is what the spec promises, and the entry names only the arrows.

Rejected: flipping the DOM order and dropping `column-reverse`. That would change the stacking, the scroll origin, the divider rule, and the streaming behaviour the earlier backlog entries pinned, all to fix two keys.

## Implementation steps

1. **The step rule.** Add `web/src/plugins/search/result-keys.ts` exporting `nextResultSelection(length, selected, key)`. It maps `ArrowUp` to `ArrowDown` and `ArrowDown` to `ArrowUp`, passes every other key through, and returns `nextListSelection(length, selected, mapped)`. Import `nextListSelection` from `../api`, as the hook already does, because the plugin boundary forbids reaching into the host.
2. **The hook.** In `web/src/plugins/search/useResultSelection.ts`, pass `nextResultSelection` to `selection.navigate` instead of `nextListSelection`, and say in the comment why the window's keys are swapped.

## Tests

- New `web/src/plugins/search/result-keys.test.ts`:
  - `ArrowUp` moves to the next index (the row above on screen) and stops at the last row.
  - `ArrowDown` moves to the previous index (the row below on screen) and stops at row 0.
  - `Home` and `End` still go to row 0 and the last row.
  - An empty list has no selection, and an unrelated key leaves the selection where it was.
- `web/src/plugins/search/SearchTab.test.tsx`: the tests that step the selection with the arrows ("opens the row the arrows moved to", "marks the selected row", "scrolls the row each arrow moves to", "scrolls as little as it must", "does not scroll again when Enter opens the row") press `ArrowUp` where they meant "move to the next match", and `ArrowDown` where they meant "move back". Add a test that `ArrowDown` from the first match leaves the highlight on it, because row 0 is already at the bottom of the page.

## Spec

`product/specs/search-tab.md`, "Navigating and opening a result": state that `↑` moves the highlight up the window, to a later match, and `↓` moves it down, to an earlier one, stopping at the top and bottom rather than wrapping.

## Out of scope

- `Home` and `End`, which keep going to the first and last match.
- The shared `nextListSelection` rule and every other plugin list.
- The search bar's own arrows, which walk the term history.
