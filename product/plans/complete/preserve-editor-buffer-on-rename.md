# Preserve Editor Buffer on Rename

**Complexity: 2/10** — the editor is already mounted persistently and retains its state; one load-effect guard prevents a renamed file reference from reloading over that state, with a focused component test and a small spec clarification.

## Goal

When a user types into a new-file editor and renames the file through its tab label, keep the unsaved buffer intact and save that same content to the renamed path.

## Approach

The `EditorTab` load effect currently runs whenever `editor.url` or `editor.name` changes. A tab rename changes both values, so the effect fetches the new not-yet-created path and loads its empty response over the dirty in-memory buffer. The editor already owns the authoritative live buffer in `api.stateRef`; the effect should fetch only while that state is still uninitialized. Once content has loaded, later file-reference changes retarget save and draft-sync operations without reloading the document.

## Implementation steps

1. Guard `EditorTab`'s initial file load so it does not fetch or call `api.load` when the editor state already exists.
2. Add a component test that types unsaved content, rerenders with the renamed file view, verifies the content and dirty state remain, and verifies save targets the renamed URL with the preserved content.
3. Update the editor functional spec to state that renaming a new-file tab preserves its live buffer. `help.md` and user documentation do not describe editor-tab renaming, so neither needs a change.

## Tests

- Extend `web/src/EditorTab.test.tsx` with one rename regression test covering preserved content, no second fetch, retained dirty state, and saving through the renamed URL.

## Out of scope

- Server-side file rename mechanics or open-file registration.
- Rename input limits and tab-label truncation.
- Restoring transient editor buffers after an application relaunch.
