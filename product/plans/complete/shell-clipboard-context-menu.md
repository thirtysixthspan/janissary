# Paste clipboard history into the shell command bar

**Complexity: 2/10.** The requested behavior is already covered by the shared context-menu and clipboard-history paths.

## Goal

Selecting “Paste from clipboard…” from the shell command bar's context menu opens clipboard history and inserts the chosen text into that bar.

## Approach

Keep the shared context-menu route. It captures the clicked command bar as the paste target, and the clipboard-history overlay returns focus and inserts the selected text there.

## Implementation

No code change was needed. The shell command bar already uses the app's default context menu, and the contributed clipboard-history overlay already accepts that anchor.

## Tests

Existing coverage in `web/src/context-menu/DefaultContextMenu.test.tsx` and `web/src/overlay-plugins/clipboard-history/paste-routing.test.tsx` verifies the menu action and insertion into a plugin command bar.

## Out of scope

Changing the context menu or clipboard-history behavior for other surfaces.
