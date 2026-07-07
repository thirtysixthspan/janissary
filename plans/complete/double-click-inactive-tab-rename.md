# Double-click inactive tab does not start rename

## Problem

The code already prevents double-click rename on inactive tabs (the `if (!active) return;` guard in `TabItem.tsx`), and the spec already documents it. But there is no test confirming that double-clicking an inactive tab selects it without opening the rename input.

## Complexity

2/10 — add one test for existing behavior.

## Solution

Add a test in `web/src/TabStrip.test.tsx` verifying that double-clicking an inactive tab fires `onSelect` but does not render a rename textbox.

## Changes

### `web/src/TabStrip.test.tsx`
- Add test: double-clicking an inactive tab label calls `onSelect` and does not show a rename input.

## Spec

Covered in `specs/tabs.md` line 78 — "Double-clicking the label of the already-active tab turns it into an editable text field." No change needed.

## Out of scope
- No source changes (behavior already correct)
- No spec changes (already documented)
