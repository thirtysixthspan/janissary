# Put the Search Results in a Scrollable Frame

**Complexity: 2/10** — two stylesheet declarations and a focus rule on the result window, with stylesheet tests. The bounded scrolling itself was restored by loading the shared plugin frame from the search entry (see `search-metadata-bar-single-line.md`).

## Goal

The result list should sit in its own scrollable frame between the metadata bar and the command line: a bounded box that scrolls inside itself, rather than a list that grows as tall as its rows.

## What was wrong

The list was never bounded. `.search-results` is `flex: 1; min-height: 0; overflow-y: auto`, which only scrolls when its parent is a flex column of fixed height, and that parent is `.plugin-tab` from `web/src/plugins/shared.css`, which the search entry did not load. Rendering a 30-row result list in a real browser at 900×500 confirmed it. Without the shared sheet, the window was 3044px tall, exactly its content, and it pushed the command line off the bottom of the screen. With the sheet, the same window is 412px tall, scrolls its 3044px of content, and the command line stays in view.

Loading the shared sheet was the previous backlog entry's fix and is already on the branch. What remains is the *frame*. The window has no edge of its own. Its bottom is the command line's rule and its top is nothing, so the scrolling region does not read as a region.

## Approach

Give `.search-results` the hairline and radius the filter fields already use, `1px solid var(--border)` and `3px`. The window then reads as one box whose contents scroll. The window is focusable and has `outline: none`, so once it has an edge that edge is also the place to show focus. A `:focus-visible` rule turns the border to `var(--accent)`, the same treatment `.search-filters input:focus` gives the fields. Tab moving focus into the window is then visible, and a mouse click does not flash it.

## Implementation steps

1. **The stylesheet.** In `web/src/plugins/search/search.css`, add `border: 1px solid var(--border); border-radius: 3px;` to `.search-results`, and add `.search-results:focus-visible { border-color: var(--accent); }`. Extend the rule's comment to say why the window is framed and that its bound comes from the shared plugin frame.

## Tests

In `web/src/plugins/search/search-style.test.ts`:

- `.search-results` carries `border: 1px solid var(--border)` and `border-radius: 3px`.
- `.search-results:focus-visible` sets `border-color: var(--accent)`.
- The shared frame the bound depends on stays in place: `.plugin-tab` in `shared.css` is a `flex-direction: column` flex box with `min-height: 0`. The existing tests already pin `.search-results` as `flex: 1`, `min-height: 0`, and `overflow-y: auto`.

## Spec

`product/specs/search-tab.md`, "The results": state that the results sit in their own framed window between the header and the command line, and that the window scrolls rather than growing past the tab.

## Out of scope

- Changing the row layout, the stacking direction, or how selection scrolls the window.
- The remaining entries in the pull request's backlog.
