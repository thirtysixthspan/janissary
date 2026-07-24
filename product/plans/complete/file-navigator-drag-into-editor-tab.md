# Drop a dragged file navigator row into an editor tab's caret position

**Complexity: 3/10** — reuses the existing file-navigator-drag-to-command-bar plumbing pattern
end-to-end (hit-test marker, imperative handle threaded via a ref, `drop()` branch); the only new
piece is exposing an insert-at-caret handle from `EditorTab` itself.

## Goal

Dragging a row out of a sidebar-docked file navigator and releasing it over an open editor tab
inserts that row's tree-relative path into the editor's buffer at the current cursor position —
mirroring the existing drag-onto-the-command-bar behavior (`useFileNavigatorDrag.ts`'s `drop()`
command-bar branch), which already inserts the same relative path into whichever tab's command bar
is reachable. Today dragging a file over an editor tab does nothing at all: `EditorTab.tsx` has no
`onDrop`/hit-test marker, and `useFileNavigatorDrag`'s hit-testing only recognizes
`[data-command-bar]`.

## Design decisions

**Reuse the exact command-bar plumbing shape, not native HTML5 drag/drop.** The file navigator's
drag gesture is already a manual mouse-based implementation (`useFileNavigatorDrag.ts`, see its own
top-of-file comment on why), not `DataTransfer`. The command-bar drop path already established the
pattern for "drag a row onto an arbitrary reachable surface": a `data-*` hit-test marker on the
target DOM node, an imperative handle object written into a ref by the target component during its
own render, and a `drop()` branch in the drag hook that checks the corresponding hovered-ref before
falling through to the row-to-row move logic. The editor case follows the same shape with its own
marker (`data-editor-drop`) and its own handle type.

**Insert the same tree-relative path the command bar already inserts.** `FileNavigatorRow.path` is
relative to the tree root (see `src/tab/types.ts`), and that's what `insertAtCaret` already receives
in the command-bar case. "Full file path" in the issue reads naturally as "the whole path, not just
the file's name" (the row also carries `row.name`, the bare filename) — consistent with the existing
command-bar insertion, not a request for an OS-absolute path.

**Only reachable from a sidebar-docked file navigator, matching the command bar's own
reachability.** `FileNavigatorTab`'s existing `dropRef` prop is "only ever passed when this tree is
docked into a sidebar" (its own doc comment) — a center-docked tree occupies the same tab-body slot
an editor would, so the two can never be visible together anyway. The new `editorDropRef` prop
follows the identical `AppShell` → `Sidebar` → `FileNavigatorTab` threading, so it's reachable under
exactly the same condition.

**Gate the handle write on `active`, unlike the command bar's handle.** `EditorTab` is mounted
persistently for every open editor tab at once (hidden via `display: none` when inactive — see its
own top-of-file comment), unlike `CommandInput`, which has exactly one live instance for whichever
tab is current. Multiple mounted `EditorTab`s would otherwise race to own the same ref on every
render. Writing `dropRef.current` only when `active` is true means the ref always reflects
whichever editor tab is actually visible (and therefore the only one whose `[data-editor-drop]`
marker is hit-testable at all, since inactive tabs are `display: none`).

**No highlight styling.** The command-bar drop target's own `setDropHighlighted` toggles a
`drop-target` class that has no corresponding CSS rule today (`grep` confirms `.command-area.drop-
target` is unstyled) — so matching that capability for the editor would add a second inert toggle,
not real, visible affordance. Skip it; `EditorDropHandle` exposes only `insertAtCaret`.

## Implementation

1. **`web/src/EditorTab.tsx`**:
   - Export `EditorDropHandle = { insertAtCaret: (text: string) => void }`.
   - Add an optional prop `dropRef?: React.RefObject<EditorDropHandle | null>`.
   - During render, when `dropRef` is provided and `active` is true, set
     `dropRef.current = { insertAtCaret: (text) => api.insert(text) }` — reusing the same
     `api.insert` the textarea's own typed/pasted input already goes through
     (`flushTextarea`/`onInput`), so the inserted text lands at the live cursor position through the
     normal buffer-mutation path (undo included).
   - Add a `data-editor-drop` attribute to the `.editor-body` div (the same element `bodyRef`
     already points at).

2. **`web/src/useFileNavigatorDrag.ts`**:
   - Import `EditorDropHandle` from `./EditorTab`.
   - Add an optional parameter `editorDropRef?: RefObject<EditorDropHandle | null>` (after the
     existing `dropRef` parameter).
   - Add `hoveredEditorBody(x, y)`, mirroring `hoveredCommandBar` but testing
     `element.closest('[data-editor-drop]')`.
   - Track hover state in a plain ref (`overEditorRef`, no component re-render needed — nothing
     visible depends on it): in `onWindowMove`, once `overBar` is computed, compute
     `overEditor = !overBar && hoveredEditorBody(e.clientX, e.clientY)` and store it in
     `overEditorRef.current`. Fold it into the existing `setDropTarget(...)` guard so hovering the
     editor also suppresses the row-drop-target highlight, matching the command-bar branch.
   - In `drop()`, add a branch after the existing command-bar branch:
     `if (gesture?.started && overEditorRef.current) { editorDropRef?.current?.insertAtCaret(gesture.path); resetGestureState(); return; }`.
   - In `resetGestureState()`, also reset `overEditorRef.current = false`, mirroring how it already
     clears the command-bar highlight.

3. **`web/src/FileNavigatorTab.tsx`**: add the `editorDropRef` prop (typed with `EditorDropHandle`)
   alongside the existing `dropRef`, with the same "only passed when sidebar-docked" doc comment,
   and pass it through to `useFileNavigatorDrag`.

4. **`web/src/Sidebar.tsx`**: add the `editorDropRef` prop and pass it into both `FileNavigatorTab`
   call sites (`side="files"` branch), mirroring `dropRef`.

5. **`web/src/AppShell.tsx`**: add the `editorDropRef` prop and pass it into both `Sidebar`
   instances (`side="left"` and `side="right"`), mirroring `dropRef`.

6. **`web/src/MountedViewLayers.tsx`**: add an `editorDropRef` prop and pass it to every mounted
   `EditorTab` as `dropRef={editorDropRef}`.

7. **`web/src/App.tsx`**: create `editorDropReference = useRef<EditorDropHandle | null>(null)`
   alongside the existing `dropReference`, pass it to `AppShell` as `editorDropRef` and to
   `MountedViewLayers` as `editorDropRef`.

## Tests

- **`web/src/EditorTab.test.tsx`**: a new case rendering an active `EditorTab` with a `dropRef`,
  calling `dropRef.current.insertAtCaret('src/notes.txt')`, and asserting the inserted text appears
  in the rendered buffer at the cursor; a second case asserting an *inactive* tab's render leaves a
  shared `dropRef` untouched (still pointing at whichever tab last set it, or `null` if none has).
- **`web/src/useFileNavigatorDrag.test.ts`**: mirror the existing `describe('drop onto the command
  bar', ...)` block for a new `describe('drop onto an editor tab', ...)`: a drag released over a
  `[data-editor-drop]` marker calls `editorDropRef.current.insertAtCaret` with the row's path
  instead of sending `moveFileNavigatorItem`; a release over a tree row still moves the file,
  unaffected by the new wiring; hovering the editor marker suppresses the row `dropTarget`
  highlight.

Run `./scripts/run.mjs check-diff`.

## Out of scope

- Native HTML5 `DataTransfer`-based drag/drop (e.g. dragging a file in from the OS file manager) —
  the existing gesture is entirely mouse-event-based and this stays consistent with it.
- Visual highlight of the editor body while a file is dragged over it (see design decision above).
- Center-docked file navigator trees — unreachable simultaneously with an editor tab today, same as
  the command bar.
- Absolute-filesystem-path insertion — the tree-relative path matches the command bar's existing
  behavior.
