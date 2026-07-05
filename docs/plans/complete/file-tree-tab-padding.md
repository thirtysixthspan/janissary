# File tree tab left padding

**Complexity: 2/10** — purely a CSS value adjustment in a single file, no logic, no new components, no server changes.

## Goal

Add 12px base left padding to file tree rows, matching the 12px left padding that agent tab content (`.transcript`) and image tabs (`.image-tab`) already have.

## Problem

The file tree tab's rows have an inline `style={{ paddingLeft: row.depth * 16 }}` that overrides the 12px left padding from the CSS `.files-row` rule. At depth 0, effective left padding is `0px`, while the agent tab's `.transcript` and image tab's `.image-tab` both have `12px` left padding.

## Implementation steps

1. **`web/src/FileTreeTab.tsx`** — Change `row.depth * 16` to `12 + row.depth * 16` on line 99. This restores the 12px base padding for all rows and keeps the depth indentation additive.

## Tests

No new tests needed — the existing tests check indentation via semantic assertions (role, aria attributes, click handlers) but don't assert pixel values from inline styles. The fix is visually verifiable.

## Verification

- `./scripts/run.mjs check-diff` passes clean
- Visual: file tree rows at depth 0 have the same left padding as agent tab content; deeper rows indent proportionally

## Out of scope

- CSS-based alternatives (moving padding to `.files-rows`)
- Any styling beyond the inline padding fix
