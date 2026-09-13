# Offer Chat about this for editor selections

**Complexity: 4/10** — editor selection state must be exposed to the shared default-menu resolver, and the editor must preserve that state while opening a right-click menu.

## Goal

Selecting text in an editor tab and right-clicking offers **Chat about this** with the editor's selected text.

## Approach

Publish the editor's existing selection text on its body for the default-menu resolver to read. Mark it as an editor selection so Copy remains limited to browser DOM selections. Ignore non-primary mouse-down events in the editor's selection handler; a right-click must leave the existing selection intact for the context-menu event that follows.

## Implementation steps

1. Expose the editor's selected text on its body and let the default-menu hook use it when there is no DOM or terminal selection.
2. Leave an editor selection unchanged for right-click mouse-down events.
3. Cover editor selection resolution, the context-menu request, and selection preservation with focused client tests.
4. Update context-menu and editor-tab specs with the behavior.

## Tests

- `web/src/context-menu/DefaultContextMenu.test.tsx`: an editor selection requests and renders the contributed action.
- `web/src/editor/EditorTab.test.tsx`: the editor body publishes its selected text.
- `web/src/editor/useEditorMouse.test.ts`: a right-click does not focus or alter the editor selection.

## Out of scope

- Offering browser Copy for editor-owned selections.
- Changing selection behavior for primary clicks, drags, or keyboard input.
