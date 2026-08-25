# Add image editor save and exit shortcuts

**Complexity: 2/10** — the image editor already exposes save and done callbacks. The change is a tab-local active-state keyboard listener with focused interaction tests and a specification update.

## Goal

Let `Cmd+S` / `Ctrl+S` save image edits and let `Escape` leave image edit mode without discarding the edit state.

## Approach

Install the listener only while this image tab is active and editing. Save uses the same hook callback as the header button, while Escape uses the existing Done transition. Both prevent the browser’s default behavior. Viewer-mode Escape keeps its current zoom-reset behavior.

## Implementation steps

1. Add active editor keyboard handling in `ImageTab` for save and exit.
2. Add tests for the shortcuts and their inactive/viewer behavior.
3. Update the image-tab functional spec and the command help’s image controls.

## Tests

- `web/src/plugins/image/ImageEditor.test.tsx` verifies Cmd+S saves and Escape returns to the viewer without losing edits.
- `web/src/plugins/image/ImageTab.test.tsx` verifies inactive tabs do not consume either editor shortcut.

## Spec updates

- `product/specs/image-tab.md` documents the editor shortcuts.

## Docs

- `help.md` extends the existing image-controls reference.

## Out of scope

- New shortcut customization or changes to viewer-mode keyboard controls.
