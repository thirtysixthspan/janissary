# Protect editor tab focus when clicking outside text lines

**Complexity: 2/10** — A CSS rule to prevent metadata text selection, and a defensive `preventDefault` in the editor mouse handler.

## Goal

Clicking in the editor tab on the metadata header (file name, size, path) or in the editor body outside any text line (blank space below the last line, gutter margins) must not steal focus from the hidden textarea. The edit cursor position and keyboard input should stay uninterrupted.

## Approach

1. Add `user-select: none` to `.image-meta` in `theme.css` so clicking metadata text never triggers browser selection that might disturb focus.
2. In `useEditorMouse.ts`, call `e.preventDefault()` when a mousedown lands in the editor body but misses all text lines (null hit), preventing browser defaults from affecting focus.

## Implementation steps

1. **CSS fix** — `web/src/theme.css`: add `user-select: none` to `.image-meta`.
2. **Mouse handler fix** — `web/src/editor/useEditorMouse.ts`: add `e.preventDefault()` in the early-return path when `hit` is null.

## Tests

- `web/src/EditorTab.test.tsx` — new test: clicking the metadata header does not steal focus from the textarea.
- `web/src/EditorTab.test.tsx` — new test: clicking in the editor body below the last line does not steal focus from the textarea.

## Out of scope

- Gutter click behavior (intentionally selects the line — standard editor UX).
- Tab-strip or app-level click handling.
- Other view tabs (image, markdown, page).

## Verification

`./scripts/run.mjs check-diff` must pass clean.
