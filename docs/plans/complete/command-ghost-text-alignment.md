# Fix command bar ghost text vertical alignment

**Complexity: 1/10** — one-line CSS fix in `theme.css`.

## Goal

Fix the vertical misalignment between the ghost suggestion text and the typed text in the command bar so they overlap perfectly.

## Background

The ghost text is an absolutely-positioned span (`inset: 0`) overlaid on the textarea. The textarea has no explicit `padding`, so browsers apply default user-agent padding (typically 2px top/bottom). This pushes the typed text down ~2px relative to the ghost, which sits flush at `inset: 0`.

## Approach

Add `padding: 0` to `.command textarea` to neutralize the browser default.

## Implementation

1. **`web/src/theme.css`** (line 226): Add `padding: 0;` to the `.command textarea` rule.
2. No test or spec changes needed — this is a visual-only CSS fix.

## Tests

No new tests. The existing rendering tests still pass.

## Out of scope

- Any other alignment or styling issues.
