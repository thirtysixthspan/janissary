# Divide the Search Results With a Horizontal Rule

**Complexity: 1/10** — one stylesheet rule, one stylesheet test, and one spec sentence. No markup or behavior changes.

## Goal

Consecutive search results currently run into each other. Each row is a dimmed header followed by up to five lines of code, and nothing but padding separates one row's last context line from the next row's header, so a long list reads as one block of code rather than as separate matches. A thin horizontal divider between rows makes each match's extent obvious at a glance.

## Approach

Draw the divider with an adjacent-sibling rule, `.search-row + .search-row`, so it only ever appears *between* two results: never above the topmost row, never under the first match at the window's bottom edge, and never when there is a single result.

The result window is a reversed column. Row 0 sits at the bottom and each later row sits above it, so for any row matched by `.search-row + .search-row` its predecessor in the DOM is the row directly beneath it on screen. A `border-bottom` on that row is therefore the line between the two. It uses `var(--border)`, the colour the tab's other hairlines already use.

The hover and selected states paint the same colour as a background, which is fine: the divider is a separator, and a highlighted row simply reads as a band between two of them. The selected row's accent `border-left` is untouched.

## Implementation steps

1. **The stylesheet.** In `web/src/plugins/search/search.css`, add `.search-row + .search-row { border-bottom: 1px solid var(--border); }` beside the `.search-row` rules, with a short comment explaining why the bottom edge is the one between two rows in a reversed column.

## Tests

In `web/src/plugins/search/search-style.test.ts`:

- The `.search-row + .search-row` rule exists and carries `border-bottom: 1px solid var(--border)`.
- The plain `.search-row` rule carries no `border-bottom` and no `border-top`, so the first match at the window's edge and a lone result stay undivided.

## Spec

`product/specs/search-tab.md`, "The results": state that a thin rule separates consecutive entries.

## Out of scope

- Any other change to the row's layout, padding, or header.
- The remaining entries in the pull request's backlog.
