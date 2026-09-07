# Track the saved image operation history independently of its undo cursor

**Complexity: 4/10** — one piece of state in one hook changes from a number to a list, a pure comparison helper joins the model module beside it, and the tests that already cover saving and undo gain the branch case neither of them reaches. No component, contract, or server change.

## Goal

Make "has this image been saved?" a question about the edits themselves rather than about where the undo cursor happens to stand, so a save followed by an undo and a different operation stays unsaved.

## Approach

`useImageEdit` records its last save as `savedCursor`, a position in the operation list, and calls the tab dirty when `model.cursor !== savedCursor`. Positions are not identities: applying an operation after an undo truncates the list at the cursor and appends, so the cursor returns to a number it has already been while the operations under it are different pixels. Save rotate, undo, flip — the cursor is back at 1, the tab reports clean, Save is disabled, and the close guard lets the flip go without asking.

Replace the number with the operation sequence itself. The save captures `activeOperations(model)` for the request it is about to send, and stores that same snapshot when the request succeeds — not the model as it stands by then, so an edit made while the save was in flight stays unsaved. Dirty becomes a value comparison between the current active sequence and that snapshot, through a pure `sameOperations` helper in `edit-model.ts` where the rest of the model's arithmetic lives.

Undo and redo keep working as they do: stepping back to the saved sequence compares equal and the tab is clean again, stepping away from it compares unequal and the tab is dirty. A replacement operation at the same cursor now compares unequal, which is the bug. The comparison is structural rather than pixel-aware, so two different routes to the same image — a flip applied twice, say — conservatively read as unsaved; that is the safe direction to be wrong in, and the item accepts it.

## Implementation steps

1. Add `sameOperations(a, b)` to `web/src/plugins/image/edit-model.ts`, comparing two operation lists element by element on each variant's own fields (a crop's rectangle, a rotate's direction, a flip's axis).
2. In `web/src/plugins/image/useImageEdit.ts`, replace the `savedCursor` state with a `savedOperations` snapshot initialised to the empty list, and compute `dirty` by comparing `activeOperations(model)` against it.
3. In the same file, have `save` capture `activeOperations(model)` before it awaits and store that captured value on success, replacing the captured `model.cursor`. Widen the callback's dependency from `model.cursor` to `model`.

## Tests

`web/src/plugins/image/edit-model.test.ts`:

- `sameOperations` is true for equal lists, including two empty ones, and false for different lengths.
- Two lists of the same length whose operations differ — a rotate against a flip, and two crops with different rectangles — compare false.

`web/src/plugins/image/ImageEditor.test.tsx`:

- Save a rotate, undo it, apply a flip: Save is enabled again and the registered dirty handle reports true. This is the case the cursor comparison got wrong.
- Save a rotate, undo it, redo it: the tab is clean at the saved sequence and dirty away from it.
- Apply a second operation while a save is still in flight: once the save resolves the tab is still dirty, because the snapshot recorded is the one that was sent.

## Spec updates

`product/specs/image-tab.md` — under "Saving an edit", state that the unsaved marker and the Save button follow the edits rather than the number of steps taken, so undoing back to what was saved reads as saved and editing away from it does not, whichever route the list took.

## Docs

None. `documentation/user-documentation/tab-types/image-viewer.md` describes the unsaved marker and undo, but says only that "the button stays dim until you have something to save" — it never stated the cursor-based rule, so nothing there is now wrong. `help.md` does not cover image editing.

## Out of scope

- Comparing rendered pixels rather than operations, which would make two routes to the same image read as saved.
- The undo cursor itself, and the toolbar's Undo/Redo enablement, which read the model directly and are unaffected.
- Persisting an image tab's edits, which remain in-memory for the life of the tab.
