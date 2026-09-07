# Paste leaves the editor caret at the start of the pasted text

**Complexity: 4/10** — one new symbolic action, a caret-placement argument on the multi-caret edit transform, a paste handler on the editor's hidden textarea, and the tests. No new architecture, no wire-protocol change, and no server involvement.

## Problem

A paste into an editor tab reaches the buffer the same way a typed character does. The hidden textarea receives the text natively, its `input` event fires, and `flushTextarea` hands the whole value to `api.insert()` — which is `insertText`, and `insertText` leaves the caret at the **end** of what it inserted.

Two things follow, both of them wrong for a paste:

- **The caret is at the end of the pasted block, not its start.** After pasting fifty lines the caret sits after line fifty, nowhere near the place the user was working.
- **The view scrolls away.** `EditorTab`'s scroll effect watches the cursor line/column and calls `keepCaretRowVisible` whenever it changes, so the body scrolls down to chase the caret to the end of the paste. The user loses the position they were reading.

Typing must keep the end-of-insert caret — after typing `a` the caret belongs after the `a` — so this cannot be fixed in `insertText`. The paste has to be told apart from the keystrokes that share its path.

`keys.ts` already describes the intended seam in its header ("Paste (Cmd/Ctrl+V) is deliberately not handled — it flows through the hidden textarea's paste event"), but no paste handler exists yet; the text arrives on the `input` event indistinguishable from typing.

## Goal

Pasting into an editor tab drops the text at the caret and leaves the caret at the **start** of what it dropped. Because the caret has not moved, the scroll effect does not fire and the view stays exactly where it was — the pasted text appears under the position the user was already looking at. Everything else about the paste is unchanged: the same text lands in the same place, one undo takes it back, and multi-caret distribution still gives each caret its own line.

## Design decisions

**A `paste` action, not a flag on `insert`.** Undo grouping, multi-caret dispatch, and the state swap all live in one place (`applyKeyAction`), and a paste differs from an insert in exactly the way that place already decides things: where the caret lands and whether the step coalesces. A second kind in the `KeyAction` union keeps that dispatch as the only edit path — a caret-placement parameter threaded through `insert` instead would make every existing caller state something it does not care about.

**No key maps to it.** The action is produced by the textarea's paste event, the same way `useEditor.insert` synthesizes an `insert` for the file-navigator drop. `Cmd+V` stays unbound in the key table, which is what lets the browser's own paste event fire at all.

**Handle the `paste` event and preventDefault, rather than sniffing `inputType` on the `input` event.** The editor's textarea is a keystroke sink, not the document — letting the browser write a large paste into it and then reading it back is a round trip through a control the user never sees, and it is the round trip that can scroll the body before React ever hears about it. Taking the text straight off `clipboardData` and cancelling the default keeps that from happening and keeps `flushTextarea` about typing and IME commits only.

**Discrete undo step, always.** `insert` coalesces single characters into a typing run; a pasted character is not a typed one, so a paste is always its own step. That is what the spec already says ("Enter/paste are discrete steps"), stated in the action rather than inferred from the text's length.

**Multi-caret paste places every caret at the start of its own chunk.** `multiEdit` gains a caret-placement argument defaulting to the current end-of-edit behavior; only paste passes `'start'`. Nothing changes for the delete kinds, whose replacement text is empty and whose start and end therefore coincide.

**Scroll is left to the existing invariant, not suppressed.** With no selection — the paste this issue is about — the caret does not move at all, so the effect does not run and the view cannot change. When a paste replaces a selection the caret lands at the selection's start, which may be a real move; the view then follows it, because "the line the caret is on can never end up off the page" (`scroll.ts`) is the stronger rule and the start of the replaced region is the right place to be looking.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The one edit dispatch (undo grouping, multi-caret split) | `web/src/editor/applyKeyAction.ts` |
| The insert transform, unchanged by this plan | `insertText` in `web/src/editor/model.ts` |
| Multi-caret clipboard distribution | `textPerSelection` in `web/src/editor/applyKeyAction.ts` |
| The offset-folding multi-caret edit | `multiEdit` in `web/src/editor/multi-caret.ts` |
| The textarea's existing event wiring | `web/src/editor/EditorTab.tsx` (`onInput`, `onCompositionStart`/`End`) |
| The query-line routing a paste must keep | `flushTextarea` in `web/src/editor/useEditorInteractions.ts` |
| The cursor-driven scroll effect that must not fire | `web/src/editor/EditorTab.tsx` (`keepCaretRowVisible`) |

## Implementation steps

1. **`web/src/editor/keys.ts`.** Add `{ kind: 'paste'; text: string }` to `KeyAction`, and note beside it that no key binding produces it — the paste event does. The `Cmd+V` comments stay as they are.

2. **`web/src/editor/multi-caret.ts`.** Give `multiEdit` a fourth parameter, `caret: 'start' | 'end'` defaulting to `'end'`, and record each selection's new offset before rather than after appending its replacement text when it is `'start'`.

3. **`web/src/editor/applyKeyAction.ts`.** Add a `pastedState(s, text)` helper beside `editedState`: multi-caret goes through `multiEdit(s, 'insert', textPerSelection(s, text), 'start')`; a single caret takes `insertText`'s result with the cursor put back to the insertion point (the selection's start when there was a selection, the cursor otherwise). Handle `'paste'` in `applyTextEdit`, always recording `'other'`.

4. **`web/src/editor/useEditor.ts`.** Expose `paste: (text: string) => void` on `EditorApi`, dispatching the new action through `applyKeyAction` like `insert` does.

5. **`web/src/editor/useEditorInteractions.ts`.** Add `onPaste(event)`: read `clipboardData`'s plain text, `preventDefault()` unconditionally so nothing reaches the textarea, then route the text to the suggest query line when that line holds focus (as `flushTextarea` already does) and to `api.paste` otherwise. An empty clipboard does nothing.

6. **`web/src/editor/EditorTab.tsx`.** Wire `onPaste={interactions.onPaste}` on the hidden textarea.

## Tests

- `web/src/editor/applyKeyAction.test.ts` — paste at a caret inserts the text and leaves the cursor at the insertion point; paste over a selection replaces it and leaves the cursor at the selection's start; a one-character paste is its own undo step (typing before it is not undone with it); a multi-caret paste whose line count matches the caret count still distributes one line per caret, with every caret at the start of its own line; multi-caret paste of non-matching text puts the whole text at every caret, each caret at its start.
- `web/src/editor/multi-caret.test.ts` — `multiEdit` with `'start'` places each caret before its inserted text, and the default placement is unchanged.
- `web/src/editor/EditorTab.test.tsx` — a paste event on the hidden textarea inserts the clipboard text at the caret, leaves the caret before it (the caret's row is the pasted text's first line, with nothing before the caret on it), and scrolls nothing (`scrollIntoView` is not called after the paste); the pasted text does not reach the hidden textarea (its value stays empty); a paste while the persona query line is focused still lands in the query text rather than the buffer.

## Spec

`product/specs/editor-tab.md`:
- The paste paragraph under Editing — say where the caret lands and that the view does not move.
- The multi-caret paragraph on `Cmd+V` distribution — say that every caret ends at the start of what it received.

## Out of scope

- **Where a typed character, `Enter`, `Tab`, or a file-navigator drop leaves the caret.** All keep the end-of-insert caret; only a paste changes.
- **Pasting non-text clipboard content** (images, files). The editor takes plain text and ignores the rest, exactly as it does today.
- **Copy/paste between harness tabs and the unified clipboard buffers** — that is the separate backlog issue.
- **Selecting the pasted text** after the paste, or any other post-paste selection state. The caret is collapsed at the start, as an insert leaves it.
- **The scroll effect itself.** No change to `keepCaretRowVisible` or to when `EditorTab` calls it.
