# Give the editor keyboard focus when a dragged file is dropped into it

**Complexity: 2/10** — one line in the editor's drop handle, matching what the command bar's drop handle already does. The caret half of the request turns out to hold already; the plan says so rather than changing code to no effect.

Dragging a file from the navigator onto the editor pane inserts its path at the cursor and leaves keyboard focus behind, in the file tree. The path appears, the caret sits after it, and the next thing typed goes to the navigator — where letters are a type-to-select gesture, not text. The user has to click into the editor before they can carry on.

The command bar does not have this problem, and the reason is written down at its own drop handle: *"Focuses the textarea before splicing: unlike a keyboard-driven insert, the caller is a file-navigator drag release, so the textarea is never already the focused/selected element."* The editor's handle is one expression — `insertAtCaret: (text) => api.insert(text)` — and never learned the same lesson.

## Approach

**Focus in the drop handle, not in the drag.** `useFileNavigatorDrag` names its targets only through the `EditorDropHandle` contract, deliberately, so it can drop onto the editor without importing it. Focus belongs on the editor's side of that contract, where the textarea ref already is — the same split the command bar's handle uses.

**The caret is already where the issue asks for it.** `insertText` returns a cursor at the end of what it inserted (`col + text.length`, or the last line's length for a multi-line drop), and the caret element renders at `state.cursor.col` whenever the tab is active — it is not gated on DOM focus, which is why the caret already *looks* right today while the keyboard goes elsewhere. So the caret needs no change, and the fix is focus alone. What makes the two feel like one bug is that a caret you cannot type at is indistinguishable from a caret in the wrong place. The tests below pin the caret position anyway: it is half of what was asked for, it is currently unverified, and a later change to the insert path could break it silently.

**Focus before inserting**, matching the command bar's ordering. Nothing here requires it — `api.insert` is a React state update, not a `document.execCommand` that needs a focused element — but the two handles reading the same way is worth more than the microscopic difference, and it means the editor takes focus even if the insert throws.

**Nothing steals focus back.** The navigator focuses its tree on row `mousedown` (`use-file-navigator-row-events.ts`), which is the start of the drag, not the end; the drop runs on the window's `mouseup`. No `click` follows onto the row either, since the release happened over the editor.

## Implementation steps

1. `web/src/editor/EditorTab.tsx` — the drop handle focuses the textarea before inserting, with a comment naming the drag release as the reason, as the command bar's does.
2. `product/specs/file-navigator-tab.md` — the "Dragging a row into an editor tab" section gains what the drop does with focus and where it leaves the cursor.
3. `documentation/user-documentation/tab-types/file-navigator.md` — the same, in the user's register, beside the paragraph that already describes the drop.

## Tests

- `web/src/editor/EditorTab.test.tsx` (extended, beside the two drop-handle cases already there):
  - a drop moves keyboard focus to the editor's textarea — blurring first, since an active editor tab claims focus on mount and would otherwise pass without the fix;
  - a drop leaves the caret at the end of the inserted path, asserted on the rendered caret's position within its row rather than on internal state;
  - a multi-line drop (several paths at once) leaves the caret at the end of the last one.

## Out of scope

- **Inserting at the drop point rather than at the caret.** Dropping inserts where the cursor already is, which is what the existing handle, its test, and the issue all describe; making the drop position choose the insertion point is a different feature.
- **The command bar's drop handle**, which already focuses correctly.
- **`.command-area.drop-target`, the drop highlight with no CSS rule behind it.** A real latent bug in the *command bar's* drag feedback, noted while working nearby, unrelated to focus and not to be fixed under cover of this.
- **Which editor tab receives a drop.** The shared handle is claimed by the active tab only, and that is correct — the drop lands on the tab the user can see.
- **New user documentation.** One addition is in scope rather than out: `documentation/user-documentation/tab-types/file-navigator.md` already describes the drop, so the sentence about focus and the cursor joins it. Nothing else is added.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: with an editor tab open, drag a file from the navigator onto it and type immediately — the characters land in the editor, right after the inserted path.
