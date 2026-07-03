# Double-click tab label to rename

## Problem
Clicking the tab label on an active tab immediately enters rename mode. This is disruptive — single-click should only select the tab, not begin editing.

## Solution
Change the label's click handler from `onClick` to `onDoubleClick` in `TabItem.tsx`. Single-click continues to select the tab (via the parent `<div>`'s handler); double-click opens the rename input.

## Changes

### `web/src/TabItem.tsx`
- `onClick` → `onDoubleClick` on the label `<span>` that triggers `startEdit()`.

### `web/src/TabStrip.test.tsx`
- Replace `userEvent.click` with `userEvent.dblClick` in all tests that expect the rename input to appear.
- Add a new test: single-click on active tab label must NOT show a textbox.

## Spec
Covered in `spec/editor-tab.md` (tab renaming section). The spec already says "Double-click the tab label to rename." — no change needed.
