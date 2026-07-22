# Renaming an editor tab must not lose unsaved content

**Complexity: 3/10** — one-line key fix in a single component, once the root cause (a React
remount, not the app logic) is identified; the app-level rename logic was already correct.

## Goal

Opening a new (not-yet-saved) file in an editor tab, typing content into it, then renaming the tab
via the tab label (double-click to rename) no longer discards the unsaved buffer. This matches
what `product/specs/editor-tab.md` already documents ("Renaming never reloads the document: any
unsaved content, dirty state, cursor, and undo history remain in the live editor buffer") — the
spec was correct, the implementation didn't match it.

## Root cause

`web/src/MountedViewLayers.tsx` renders each editor tab's wrapping `<div>`/`<EditorTab>` keyed on
`t.editor!.url` (line 45). `src/tab/rename-editor.ts`'s `renameEditorTab` mints a brand-new
registry URL for the renamed path (`registerFile(newPath)` → a new `/open/<id>` token), since the
file registry always assigns a fresh id per path. When that new `editor.url` reaches the client,
React sees the list item's `key` change and **unmounts the old `EditorTab` instance, mounting a
new one** — discarding all of its component state (buffer, dirty flag, cursor, undo history).

`EditorTab.tsx`'s own load effect already guards against redundant fetches within a single mounted
instance (`if (api.stateRef.current !== null) return;`, line 64), which is why the existing
`EditorTab.test.tsx` "preserves unsaved content" test passes — it calls `rerender` on the *same*
mounted instance and never exercises the keyed-list remount that the real app goes through via
`MountedViewLayers`. The remount bypasses that guard entirely, since a fresh instance's
`api.stateRef.current` is legitimately `null` and fetches the (empty, since it was never saved)
content at the new URL.

## Approach

Key the editor tab's wrapping `<div>` on `t.label` instead of `t.editor!.url`. A tab's `label` is
its stable identifier — `renameEditorTab` never changes it (only `title`/`editor.name`/`path`/
`editor.url` change) — so the `EditorTab` instance stays mounted across a rename, and its existing
load-effect guard does the right thing with the new url (used for the next save/watch, not a fresh
fetch).

## Implementation steps

1. In `web/src/MountedViewLayers.tsx`, change the editor tab's `key={t.editor!.url}` (line 45) to
   `key={t.label}`.

## Tests

- **`web/src/MountedViewLayers.test.tsx`** — new test: render with an editor tab, capture a mount
  marker (extend the file's existing `EditorTab` mock with a `useEffect(() => {...}, [])` that
  increments a shared counter), then re-render the same tabs array with only `editor.url`/`name`/
  `path` changed (same `label`) and assert the mount counter did not increase — the component
  stayed mounted rather than being torn down and recreated.

## Out of scope

- Any change to `src/tab/rename-editor.ts` or the file registry's URL-minting — those already
  behave correctly per spec; the bug was purely in how the client keyed the mounted component.
- Page tabs' `key={t.page!.url}` — page tabs have no rename affordance, so this doesn't apply
  there.
