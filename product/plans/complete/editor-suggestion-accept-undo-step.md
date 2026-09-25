# Record an accepted editor suggestion as its own undo step

## Complexity

3/10. The change is confined to the in-editor suggestion surface in `web/src/editor/`: one new pure helper beside `spliceHunk`, a new port on `useEditorSuggest`, and one changed argument in `EditorTab.tsx`. No server, wire, or protocol changes.

## Goal

The editor already exposes `replace` on `EditorApi` (`web/src/editor/useEditor.ts`), which records the current state as one discrete `'other'` undo step before swapping in a state an outside transform produced; the editor plugins apply their results through it. The persona-suggestion hook was wired to the raw `setState` instead: `EditorTab` calls `useEditorSuggest(client, editor.url, api.setState, requestSave)`, and `acceptHunk` does `setState(resolveHunk(index, newText !== null, applied))` with `applied = fromText(newText, state.cursor.line)`.

Two things go wrong. The accepted change never enters the undo history, so the next Cmd+Z restores the snapshot taken before the previous typing group, undoing the suggestion and the user's own last edit together. And rebuilding the state from text through `fromText` resets the caret to column 0 and drops every extra selection.

After this change, accepting a hunk is one undo step: Cmd+Z right after an accept restores exactly the pre-accept buffer, and a second Cmd+Z undoes the user's earlier typing on its own. The caret keeps its line and column (clamped to the new text), and extra selections survive the same way.

## Approach

- Add `applyHunk(state, hunk)` to `web/src/editor/suggestDiff.ts`, next to `spliceHunk`. It splices the hunk into the state's text and returns the new state, or `null` when the anchor no longer matches. Every selection (primary and extras) is kept, with its cursor and anchor clamped to the new lines through `clampPos`, and rebuilt through `withSelections` so any two that converge merge into one caret. It is pure, so the caret rules are testable without a render.
- `useEditorSuggest` gains a required `replace: (s: EditorState) => void` parameter after `setState`, used only by `acceptHunk`. The hook's other `setState` uses (the jump from the query line into the buffer) are cursor moves, not content edits, and keep the raw setter. `onSave` moves to the fifth position and keeps its default.
- `acceptHunk` calls `replace(applied)` only when the hunk applied. A hunk whose anchor no longer matches makes no state write and so records no undo step; it resolves as not accepted, exactly as today.
- `resolveHunk` returns nothing: every branch returned its `state` argument unchanged, so its caller no longer needs to thread the state through it. `declineHunk` then makes no buffer write at all, since declining never changes the buffer. Its `state` parameter stays in the `EditorSuggestApi` type (named `_state` in the implementation) so `EditorLines.tsx` and the test doubles that build the API do not change.
- `EditorTab.tsx` passes `api.replace` alongside `api.setState`.

Rejected: routing the accept through `api.apply` with a new key action. Accepting a hunk is not a keystroke and has no place in the key table; `replace` already exists for exactly this kind of outside transform.

Rejected: making `replace` optional with a default of `setState`. A caller that forgot the port would silently get the old, broken undo behavior back.

## Implementation steps

1. `web/src/editor/suggestDiff.ts`: add `applyHunk(state, hunk)`.
2. `web/src/editor/useEditorSuggest.ts`: add the `replace` parameter, rewrite `acceptHunk` on `applyHunk` + `replace`, make `resolveHunk` return nothing, and drop the buffer write from `declineHunk`.
3. `web/src/editor/EditorTab.tsx`: pass `api.replace`.
4. Update the tests listed below and run `./scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/editor/suggestDiff.test.ts`: `applyHunk` returns null when the anchor does not match; keeps the caret's line and column when both still exist; clamps a caret whose line got shorter; clamps a caret whose line no longer exists; keeps and clamps extra selections, merging two that converge.
- `web/src/editor/useEditorSuggest.test.ts`: every render passes the new `replace` port. The accept cases assert the applied state arrives through `replace` and that `setState` is never called for an accept; a new case asserts an accept whose anchor no longer matches calls neither port. The decline case asserts the buffer is left alone by calling neither port.
- `web/src/editor/EditorTab.test.tsx`: type into the buffer, open a query, accept a hunk, then press Cmd+Z and assert the buffer is exactly its pre-accept text (the typed line is still there); a second Cmd+Z then undoes the typing.

## Out of scope

- Moving the query line's own editing onto a shared undo surface.
- Any change to how hunks are matched, previewed, or finalized.

## Documentation and specification impact

`product/specs/editor-tab.md`, "In-editor persona suggestions": state that accepting a change is its own undo step, so an undo right after it restores the buffer as it was before the accept, and that the caret keeps its position. `help.md` and `documentation/user-documentation/` do not describe how accepting a suggestion interacts with undo and are left alone.
