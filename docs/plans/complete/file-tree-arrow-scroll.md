# File tree arrow-key scrolling follows selection

**Complexity: 3/10** — add a `useEffect` in `FileTreeTab.tsx` that scrolls the selected row into view when `selected` changes. Pure client-side; no server changes.

## Goal

When navigating the file tree with arrow keys, Home, End, PageUp, PageDown, or type-ahead, the visible scrollport automatically adjusts so the currently selected row is visible. This matches standard tree/list navigation behavior.

## Background

Currently `files-rows` has `overflow-y: auto` but no `scrollIntoView` logic. When the selected index changes via keyboard, the DOM selection updates but the scroll position stays — so the selected row can move out of the visible area (especially with PageUp/PageDown, Home/End, or long trees).

## Approach

Add a `data-path` attribute to each row `<div>`. When `selected` changes, query for `[data-path="..."]` and call `scrollIntoView({ block: 'nearest' })` on it. `block: 'nearest'` avoids unnecessary scrolling when the element is already visible.

## Implementation

1. **`web/src/FileTreeTab.tsx`** — two changes:
   - Add `data-path={row.path}` to the row `<div>` (line ~97).
   - Add a `useEffect` keyed on `selected` that queries `[data-path="..."]` and calls `.scrollIntoView({ block: 'nearest' })` inside the `files-rows` container.

2. **`web/src/FileTreeTab.test.tsx`** — no new tests needed (scrolling behavior is not meaningfully testable with JSDOM without complex mocking; the existing key-navigation tests cover the functional behavior).

3. **`spec/file-tree-tab.md`** — no spec update needed (the mouse-interactions and keyboard-interactions tables already describe arrow-key navigation; the scroll-follow is an implementation detail of that behavior).

## Tests

No new tests. The `scrollIntoView` mock wouldn't add value. The existing key-navigation tests in `FileTreeTab.test.tsx` continue to verify that arrow keys move selection and Enter activates the selected item.

## Out of scope

- Mouse wheel / trackpad scrolling (already works).
- Click-to-select scrolling (clicking a row that requires scrolling is a less common pattern; the existing behavior is tolerable).
- Any other file tree tab issues.
