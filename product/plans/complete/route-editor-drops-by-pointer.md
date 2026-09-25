# Route a file-navigator drop onto the editor under the pointer

Backlog: technical debt — "Route a file-navigator drop onto an editor by the editor body under the pointer, the way harness drops already are, instead of through one shared "active editor" ref."

Complexity rating: 5/10

## Goal

Editor drops go through one shared ref that the focused `EditorTab` overwrites during render and never clears. Split panes show two editors at once, so releasing a drag over the unfocused editor types the path into the other, focused editor — dirtying a file the user was not looking at — and a closed editor's handle can linger in the ref. Harness drops already solved the same problem with a registry keyed by the value on the element under the pointer.

## Approach

- Move `web/src/harness-drop-registry.ts` to `web/src/shared/drop-registry.ts` (two features now import it) and give it a second map for editors: `registerEditorDrop(label, handle)` / `editorDropHandle(label)` beside the existing harness pair. Unregistering removes a key only while it still holds the handle it registered, so a remount's cleanup ordering cannot drop the newer handle.
- `EditorTab` writes `data-editor-drop={tab.label}` on its body and publishes its handle through a new `useEditorDrop` hook in `web/src/editor/`, registered in an effect gated on `visible` with cleanup. The focus-then-insert behaviour moves into that hook unchanged.
- `useFileNavigatorDrag` reads the label off the hovered `[data-editor-drop]` element (`hoveredEditor` in `drag-hover.ts`, beside `hoveredHarnessPty`) and looks it up at drop time; an unregistered label drops nothing.
- Delete the `editorDropRef` prop chain through `App.tsx`, `AppMain.tsx`, `AppShell.tsx`, `Sidebar.tsx`, `FileNavigatorTab.tsx`, `file-navigator-tab-types.ts` and `MountedViewLayers.tsx`, and `EditorTab`'s `dropRef` prop.

## Implementation steps

1. Move and extend the registry; update imports in the harness hook, drag hook and their tests; refresh the `drop-handles.ts` comments.
2. Add `useEditorDrop` and wire `EditorTab` to it.
3. Key the drag hook's editor drop by the hovered label.
4. Remove the prop chain.

## Tests

- `web/src/shared/drop-registry.test.ts`: an older registration's removal leaves a newer one under the same key; editor handles register and unregister by label; editor and harness maps stay separate.
- `web/src/editor/EditorTab.test.tsx`: the drop-handle block goes through the registry by tab label (insert, focus, caret placement); a hidden editor publishes nothing and withdraws its handle when hidden or unmounted; two visible editors keep separate handles and a drop reaches only the one named.
- `web/src/file-navigator/useFileNavigatorDrag.test.ts`: the editor cases register by label; with two editors registered, the drop reaches only the one under the pointer; an editor body whose label has no handle drops nothing.
- `web/src/harness/useHarnessPtyDrop.test.ts`, `web/src/harness/HarnessTab.test.tsx` and `web/src/file-navigator/FileNavigatorTab.test.tsx` keep passing.

## Out of scope

- The command bar's own `dropRef`, which targets the one command bar rendered in the center.

## Specs and docs

- `product/specs/file-navigator-tab.md`: an editor is a drop target while visible, focused or not, and the drop lands only in the editor under the pointer.
- `documentation/user-documentation/tab-types/file-navigator.md`: the same, in the drag-onto-editor paragraph.
- `help.md`: does not describe editor drops; no edit.
