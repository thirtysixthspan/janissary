# Blinking line cursor in the edit window

**Complexity: 1/10** — feature is already fully implemented; add tests for caret DOM presence and update spec documentation.

## Goal

A blinking line cursor shows up in the edit window to mark the location of where text will be inserted when typing.

## Background

The feature is already fully implemented:

- **CSS** (`web/src/theme.css`): `.editor-caret` is a zero-width inline span whose `::after` paints a 2px-wide accent-colored vertical bar. `@keyframes editor-caret-blink` toggles opacity at 50% on a 1s cycle with `steps(1)` for a hard on/off blink.
- **Rendering** (`web/src/editor/render.tsx`): `contentSegments()` inserts the `<span className="editor-caret" ref={caretRef} />` at the exact column position within the text flow.
- **Tab integration** (`web/src/EditorTab.tsx`): `caretCol` is only set when the tab is active (non-active tabs pass `-1`), and `caretRef.current?.scrollIntoView()` keeps the caret visible on any cursor movement.

What's missing: tests that assert the caret element appears in the DOM, is absent when the tab is inactive, and appears only on the cursor line. Also, the spec doesn't document the blink behavior or active-only visibility.

## Approach

Add three DOM-level tests to `web/src/EditorTab.test.tsx` and update `spec/editor-tab.md` to document the caret's blinking behavior and active-only visibility.

## Implementation steps

1. **Add caret DOM tests** to `web/src/EditorTab.test.tsx` — verify that an `.editor-caret` span exists in the DOM when the tab is active, is absent when inactive, and appears on the cursor line but not other lines.

2. **Update spec** — add a "Caret" section to `spec/editor-tab.md` documenting the blinking vertical bar, its visual appearance (accent-colored, 2px wide, 1s hard-blink cycle), and that it only appears when the tab is active.

3. **Run `./scripts/run.mjs check-diff`** after each step.

## Testing

- `web/src/EditorTab.test.tsx` — three new test cases:
  - An `.editor-caret` span exists in the active editor tab
  - No `.editor-caret` span exists when the editor tab is inactive (`active={false}`)
  - The caret span appears on the cursor line but not on other lines

## Out of scope

- Implementation changes — the feature already works
- CSS changes — the blink animation is correct
- Server-side changes

## Verification

`./scripts/run.mjs check-diff` must pass clean.
