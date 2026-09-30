# Select Search Results with One Click and Open with a Double Click

**Complexity: 3/10** — separate mouse selection from activation within the existing search components and hook.

## Goal

A single click selects the result and focuses the result window for keyboard navigation. A double click opens the clicked match in an editor. Return continues to open the selected result.

## Approach

Keep the shared list selection and the search-specific arrow direction. Make the search hook's click policy select without opening, regardless of prior clicks. Forward a native double-click event from `SearchRow` through `ResultTable` to the tab's existing open handler. Native double-click recognition supplies the timing rule without timers or changes to other plugin lists.

## Implementation steps

1. Update `useResultSelection.ts`, `SearchTab.tsx`, `ResultTable.tsx`, and `SearchRow.tsx`. Correct their existing click-policy comments. Replace the old single-click-opening assertions and add interaction regressions in `SearchTab.test.tsx`; adapt `SearchRow.test.tsx` to the new callback. Run `./scripts/run.mjs check-diff`.
2. Update `product/specs/search-tab.md` so selecting and opening are distinct. Complete this plan, remove the resolved backlog entry, and restore the backlog to the master comment-and-heading skeleton. Check the final diff before committing and pushing to the existing PR branch.

## Tests

- A single click on the initially selected result does not open it.
- Clicking another row selects it and focuses the results without opening an editor.
- Separate clicks on the same row remain selection-only, including after moving focus away.
- A native double-click sequence opens the clicked row exactly once with its path and line.
- Arrow navigation and Return start from the row selected with the mouse.
- Existing keyboard activation, streaming-selection, focus-indicator, and row rendering coverage continue to pass.

## Documentation

Neither `help.md` nor the public documentation describes mouse activation of search results. Update the functional spec only. The backlog requests no PR description change.

## Out of scope

The shared selection API, other plugin lists, search scanning, result ordering, row layout, and PR description changes.
