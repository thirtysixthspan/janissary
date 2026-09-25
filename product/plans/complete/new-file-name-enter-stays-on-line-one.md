# Return on a New File's Name Leaves the Cursor on Line 1

**Complexity: 2/10** — one missing `preventDefault` in the shared inline-edit input; the rename commit and the focus hand-back to the buffer already work.

## Goal

After opening a new file in an editor tab, typing its name, and pressing Return, the keyboard focus lands in the buffer with the cursor still on line 1 and the buffer unchanged.

## Approach

Return in the shared inline-edit input commits by blurring the input, and the editor's rename commit moves focus to the buffer's hidden textarea — all while the Return keydown is still being dispatched. The key's default action was never cancelled, so the browser delivers the line break it produces to whatever holds focus when that default runs: the buffer, which inserts a newline and moves the cursor to line 2.

Cancelling Return's default in the shared inline-edit input stops the line break from reaching any surface that takes focus during the commit. None of the input's callers rely on Return's default action: it is a single-line field, and none sits inside a form that Return would submit. The same fix covers every rename surface built on the input (tab labels, file-navigator rows, conversation titles, the page address editor), each of which could hand focus to a text surface the same way.

## Implementation steps

1. `web/src/shared/InlineEditInput.tsx`: call `preventDefault()` on the Return keydown before blurring to commit.

## Tests

- `web/src/shared/InlineEditInput.test.tsx` (new): Return commits via blur and its keydown is default-prevented; Escape cancels.
- `web/src/editor/EditorMetaName.test.tsx`: Return on the name input is default-prevented while it commits.
- `web/src/editor/EditorTab.test.tsx`: accepting a new file's name with Return returns focus to the buffer with the cursor on line 1 and the buffer unchanged.

## Spec and docs

- `product/specs/editor-tab.md` — the new-file rename paragraph: accepting with Enter leaves the cursor on line 1 and does not type a line break into the buffer.

## Out of scope

- Any other change to the rename flow, its first-save auto-suffix, or Escape handling.
