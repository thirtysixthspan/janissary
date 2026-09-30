# Show the Search Selection Border Only While Results Have Focus

**Complexity: 2/10** — a scoped focus selector, regression coverage, and a spec clarification.

## Goal

Show the selected result's accent left border while focus is inside the result window. Moving focus elsewhere hides that border without losing the selected row.

## Approach

Keep the selected row's existing background and transparent base border. Apply the accent border through a result-window `:focus-within` selector so browser focus controls its visibility without additional React state. Keep the window's own frame unchanged.

## Implementation steps

1. Update `web/src/plugins/search/search.css` and the focused regression coverage in `search-style.test.ts` and `SearchTab.test.tsx`. Narrow the existing frame test to the frame itself so a descendant focus rule is allowed. Run `./scripts/run.mjs check-diff`.
2. Clarify the focus indicator in `product/specs/search-tab.md`, complete this plan, and remove the first PR backlog entry. Check the final diff before committing and pushing to the existing PR branch.

## Tests

- The selected row has a transparent base border and receives an accent only while the result window has focus; the window frame stays unchanged.
- Moving focus from results to the search bar and back preserves the selected row and does not open it.

## Documentation

Neither `help.md` nor the public documentation describes result selection focus, so neither needs a change.

## Out of scope

Mouse activation behavior, keyboard navigation, result ordering, scanning, and PR description changes.
