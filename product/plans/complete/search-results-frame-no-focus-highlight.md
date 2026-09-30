# Stop Highlighting the Search Result Frame on Focus

**Complexity: 1/10** — one stylesheet rule removed, one stylesheet test inverted, and one spec sentence corrected.

## Goal

The search tab's result window should not change its frame when it has keyboard focus. The frame keeps its ordinary hairline whether the window is focused or not.

## What is wrong

`web/src/plugins/search/search.css` carries `.search-results:focus-visible { border-color: var(--accent); }`, added when the window was first framed (see `search-results-scrollable-frame.md`). Tabbing into the window, or clicking a row once keyboard navigation is in play, turns the whole frame the accent colour. The pull request's reviewer does not want that highlight. The selected row already carries its own accent edge and background, so the focused window still shows where the keyboard is.

## Approach

Delete the `:focus-visible` rule. The window keeps `outline: none`, so the browser's own focus ring does not appear in its place, and the frame stays `1px solid var(--border)` in every state.

Nothing in `web/src/plugins/shared.css` or `web/src/theme.css` targets the window's focus, so no other rule takes over once this one is gone.

## Implementation steps

1. **The stylesheet.** In `web/src/plugins/search/search.css`, remove `.search-results:focus-visible { border-color: var(--accent); }`. Leave `outline: none` on `.search-results` in place.

## Tests

In `web/src/plugins/search/search-style.test.ts`, replace "marks keyboard focus on the result window's frame" with a test that the stylesheet carries no `.search-results:focus` or `.search-results:focus-visible` rule, and that `.search-results` still sets `outline: none` so no browser ring replaces the removed highlight.

## Spec

`product/specs/search-tab.md`, "The results": drop the clause saying the frame is highlighted while the window has keyboard focus, and state that the frame looks the same whether or not the window has focus.

## Out of scope

- The selected row's own highlight, which stays.
- The search bar's and the filter fields' focus styles.
- The arrow key direction in the result window, which is the next backlog entry.
