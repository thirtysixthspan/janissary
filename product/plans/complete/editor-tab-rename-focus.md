# Return focus to editor content after renaming a tab via its label

**Complexity: 2/10** — thread one existing lookup (`editorHandles.current.get(label)?.focus()`, already used by `CloseSaveGuard.tsx`) through `TabItem`'s commit handler. No new state, no protocol changes, no new components.

## Goal

Double-clicking an editor tab's label to rename it (an editor tab's rename always renames the
underlying file — see `product/specs/editor-tab.md`'s "New files" section) opens an inline text
input. Committing the rename (Enter, or clicking elsewhere to blur) tears down that input but
never returns keyboard focus anywhere — it is left on `document.body`, so the user has to click
back into the editor buffer before they can keep typing. This fix returns focus to the editor
buffer immediately after a rename commits.

## Approach

`TabItem.tsx`'s `commit()` (`web/src/TabItem.tsx:39-43`) calls `setEditing(false)` (unmounting
`InlineEditInput`) and `onRename(index, draft)`, a fire-and-forget WS call
(`web/src/ws.ts:93`, `client.renameTab`) — nothing focuses anything afterward.

`web/src/CloseSaveGuard.tsx` already shows the established pattern for imperatively focusing an
editor tab's content from outside `EditorTab`: `editorHandles.current.get(tab.label)?.focus()`,
where `editorHandles` (`web/src/App.tsx:121`) is a `Map<string, EditorTabHandle>` keyed by tab
label and `EditorTabHandle.focus()` focuses the hidden textarea
(`web/src/EditorTab.tsx:134-138`).

`commit()` runs synchronously, before the fire-and-forget rename request round-trips to the
server and before `tabs` (and therefore `editorHandles`'s keys, which track `t.label`) update —
so the *pre-rename* `tab.label` closed over in `TabItem` is still a live key in `editorHandles` at
the moment `commit()` runs. Add a callback prop, thread it down from `App.tsx` through
`TabStrip.tsx` to `TabItem.tsx`, and call it with the pre-rename `tab.label` right after
`onRename(...)` in `commit()`. For non-editor tabs (agent, harness, page, markdown), the label
simply has no entry in `editorHandles`, so the lookup is a harmless no-op — no branching on tab
kind is needed.

## Implementation steps

1. In `web/src/TabItem.tsx`, add `onFocusEditor?: (label: string) => void;` to the
   `TabItemActions` type. In `commit()`, after `onRename(index, draft);`, add
   `onFocusEditor?.(tab.label);`.
2. In `web/src/TabStrip.tsx`, destructure `onFocusEditor` from `Properties` (it flows in via
   `TabItemActions`) and pass it through to `<TabItem ... onFocusEditor={onFocusEditor} />`.
3. In `web/src/App.tsx`, pass `onFocusEditor={(label) => editorHandles.current.get(label)?.focus()}`
   on the `<TabStrip ... />` render (`web/src/App.tsx:179-189`).

## Tests

Add to `web/src/TabStrip.test.tsx`, mirroring the existing "commits the trimmed value once on
Enter" test's setup (`web/src/TabStrip.test.tsx:153-163`):

1. **Commit returns focus to the editor.** Render `TabStrip` with an `onFocusEditor` spy and a
   tab whose `label` is known. Double-click the label, type a new name, press Enter. Assert
   `onFocusEditor` was called once with the tab's original label.
2. **Cancel (Escape) does not call `onFocusEditor`.** Same setup as the existing "cancels without
   committing on Escape" test (`web/src/TabStrip.test.tsx:186-196`); assert `onFocusEditor` is
   not called.
3. **`onFocusEditor` is optional.** Render `TabStrip` without passing `onFocusEditor` at all and
   commit a rename via Enter; assert it does not throw (matches the pattern of tests that omit
   `onFocusCommandBar` today).

Run `./scripts/run.mjs check-diff` after writing tests; all must pass.

## Spec updates

- `product/specs/editor-tab.md`, in the "New files" section's rename paragraph (around line 65,
  "Renaming never reloads the document..."): add a sentence noting that after the rename commits,
  keyboard focus returns to the editor buffer so typing can continue immediately.

## Docs

- Checked `help.md` — no mention of tab-rename focus behavior. No update needed.
- Checked `documentation/user-documentation/` — no page describes tab-rename focus behavior. No
  update needed.

## Out of scope

- Non-editor tabs (agent/harness/page/markdown) regaining any particular focus after rename —
  the issue is specifically about editor-tab content, and `editorHandles` naturally has no entry
  for other tab kinds, so this fix has no effect on them.
- Any change to `InlineEditInput.tsx`'s own focus/blur/commit mechanics — only what happens
  *after* commit changes.
- Any change to the rename request/response protocol (`client.renameTab`, `src/tab/manager.ts`).
