# Match the query line's keybindings to the buffer's

**Complexity: 5/10** — no new architecture; extracts the buffer's existing key-action switch into a
shared function so the ephemeral query line can reuse it with its own undo/kill state, then swaps
the query line's ad-hoc key handling over to it.

## Goal

In the editor tab, the ephemeral agent query line accepts the same keybindings as the main text
buffer (Cmd/Ctrl+S save, Cmd/Ctrl+Z undo, Shift+Cmd/Ctrl+Z redo, Cmd/Ctrl+A select-all, Cmd/Ctrl+C
copy, Cmd/Ctrl+X cut, Cmd+Left/Right/Up/Down and the Ctrl emacs subset, Page Up/Down), except Tab
and Enter, which keep their query-specific behavior (persona-name completion / status-pill focus,
and firing the request). Cmd+S while the query line holds focus saves the editor file, same as in
the buffer.

## Design decisions

**Extract the buffer's key-action switch into a shared, surface-agnostic function.** Today
`useEditor.ts`'s `apply()`/`applyEdit()` hard-codes the buffer's own `stateRef`/`setState`/`undo`/
`kill`. A new `web/src/editor/applyKeyAction.ts` exports `applyKeyAction(surface, action, pageLines,
resolveVertical?)`, where `surface` is `{ getState, setState, undo, kill, onSave }`. `useEditor.ts`
becomes a thin wrapper that builds one `surface` for the buffer; `useEditorSuggest.ts` builds a
second one for the query line, with its own `UndoBuffer` and kill-buffer ref, and an `onSave`
callback passed in from `EditorTab.tsx`.

**The query line's own multiline Up/Down/exit-to-buffer logic stays separate**, since it isn't part
of "same keybindings as the buffer" — it's the pre-existing feature that lets the caret cross
between the query and the buffer. `handleQueryEdit` keeps that special case for plain
ArrowUp/ArrowDown (no Cmd/Ctrl), then falls through to `actionForKey()` + the new
`suggest.applyQueryAction()` for everything else, replacing its current manual reimplementation of
Left/Right/Home/End/Backspace/Delete/printable-insert.

**`UndoBuffer` gets a `clear()` method**, called from `openQueryLine()`, so a freshly opened query
line never inherits undo history from a previous, already-closed query session.

**Cmd+S is threaded through as an `onSave` callback**, mirroring how `useEditor(onSave)` already
receives it — `EditorTab.tsx` passes the same `() => { void save(); }` closure to
`useEditorSuggest`, forward-referencing `save` the same way it already does for `useEditor`.

**Incidental parity fix, not a separate change:** Alt+character on the query line currently inserts
directly (bypassing `actionForKey`, which returns `null` when `altKey` is set); after this change it
falls through to the hidden textarea/IME path instead, exactly like the buffer already does. This is
what "same keybindings as the buffer" requires, not a regression.

## Implementation steps

1. **`web/src/editor/undo.ts`** — add `clear(): void` to `UndoBuffer` (resets both stacks and
   `lastKind`/`lastTime`).
2. **`web/src/editor/applyKeyAction.ts` (new)** — extract the `EditSurface` type and the
   `applyKeyAction` function (the current `apply`/`applyEdit`/`insert`/`move`/`edit` logic from
   `useEditor.ts`), parameterized over `surface: EditSurface` instead of closing over the buffer's
   own refs directly.
3. **`web/src/editor/useEditor.ts`** — rewrite to build one `EditSurface` from its own
   `stateRef`/`setState`/`undo`/`kill`/`onSave` and delegate `apply`/`insert` to `applyKeyAction`.
   Public `EditorApi` shape is unchanged.
4. **`web/src/editor/useEditorSuggest.ts`** — accept a new `onSave: () => void` parameter; add a
   query-line `UndoBuffer` and kill-buffer ref; add `applyQueryAction(action, pageLines)` to
   `EditorSuggestApi`, built the same way as the buffer's surface but reading/writing the query
   line's state; call `queryUndo.clear()` in `openQueryLine`.
5. **`web/src/editor/handleSuggestKeyDown.ts`** — thread a `pageLines: number` parameter through
   `handleSuggestKeyDown` → `handleQueryLineKeyDown` → `handleQueryEdit` (default `20` so existing
   call sites without it keep working). Rewrite `handleQueryEdit` to keep only the plain-arrow
   multiline-navigation special case, then dispatch everything else via `actionForKey()` +
   `suggest.applyQueryAction()`. Drop the now-unused `deleteBackward`/`deleteForward` imports; keep
   `insertText` (still used for Shift+Enter) and `moveCursor` (still used for the special case).
6. **`web/src/EditorTab.tsx`** — pass `pageLines()` into `handleSuggestKeyDown(...)`, and pass
   `() => { void save(); }` as `useEditorSuggest`'s new fourth argument.

## Tests

Add to `web/src/editor/handleSuggestKeyDown.test.ts` (query line focused, `focusTarget: 'query'`):

- Cmd+S (`metaKey`) on the query line calls the new `applyQueryAction`/`onSave` path (assert via a
  `suggest.applyQueryAction` mock, since the test harness stubs `EditorSuggestApi` directly).
- Cmd+Z calls `applyQueryAction` with an `undo` action; Shift+Cmd+Z with `redo`.
- Cmd+A calls `applyQueryAction` with `selectAll`.
- Cmd+C / Cmd+X call `applyQueryAction` with `copy` / `cut`.
- Cmd+ArrowUp on the query line (a `docEdge` action) does not trigger the special multiline
  cross-into-buffer path (`exitQueryToBuffer` not called), unlike a plain ArrowUp at the edge.
- Existing printable/Backspace/Left-Right/ArrowUp-Down/Escape/Tab/Enter tests stay green (now
  routed through `applyQueryAction` instead of `setQueryLineState` directly for the
  edit/movement cases — update assertions to check `applyQueryAction` calls with the expected
  `KeyAction` instead of the resulting `EditorState`, since that mapping is what changed).

Add to `web/src/editor/undo.test.ts` (existing file, if present — otherwise add cases inline in
whichever suite already covers `UndoBuffer`): `clear()` empties both undo and redo stacks and resets
coalescing state.

New `web/src/editor/applyKeyAction.test.ts`: covers `save` invoking `surface.onSave`, `undo`/`redo`
against a supplied `UndoBuffer`, `selectAll`/`copy`/`cut`, and `insert` coalescing — mirroring
`useEditor.test.ts`'s existing coverage of the same behavior (now delegated).

## Verification

`./scripts/run.mjs check-diff` after each step.

## Out of scope

- Routing paste/IME insertion on the query line through `applyQueryAction` for undo purposes — the
  issue is about keybindings, not paste; the query line's paste path continues to insert directly.
- Any change to the buffer's own keybindings or the query line's Tab/Enter/Escape/pill-focus
  behavior — these are explicitly preserved as-is.
