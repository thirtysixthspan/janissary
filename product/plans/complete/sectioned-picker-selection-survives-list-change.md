# Keep the task and profile pickers' selection on a real, selectable row when the list changes

**Complexity: 3/10** — confined to `web/src/pickers/`: one new pure module, two key modules re-pointed at it, and one effect in each of two hooks. No wire, server, or component change.

Both sectioned pickers (the `tasks` / `Ctrl+A` task picker and the bare `profile launch` profile picker) keep a raw row index in React state that is set only on open and on key outcomes. The rows come from the `tasks` and `profiles` lists the server rebuilds on every state broadcast, so when a task file or profile is deleted, added, or renamed while the picker is open, the stored index can point past the end of the list or onto a section header. `handleTaskPickerKey` and `handleProfilePickerKey` both open with `const row = rows[index]; if (row.header) return { index };`: past the end, `row` is `undefined` and the next keystroke throws inside the window key handler; on a header, every key including Escape is swallowed, leaving a picker the keyboard cannot close. The header-aware seek and first-selectable helpers are also copied between the two modules.

## Goal

The stored selection is always a selectable row (or 0 for a list with none), Escape always closes the picker, and the header-aware row arithmetic has one definition shared by both pickers.

## Approach

1. **New pure module `web/src/pickers/sectioned-rows.ts`**, generic over any row with an optional `header` flag:
   - `firstSelectable(rows)` — the first non-header index, or 0 when there is none (replaces `firstSelectableIndex` and `firstProfileIndex`).
   - `seekSelectable(rows, index, step)` — the nearest non-header row in the `step` direction, staying put at an edge (replaces both private `seek` helpers).
   - `normalizeIndex(rows, index)` — 0 for an empty list; otherwise the index clamped into range, and if that row is a header, the nearest selectable row after it, else before it, else 0.

2. **Key handlers** (`handleTaskPickerKey`, `handleProfilePickerKey`): handle `Escape` first, before any row lookup, closing with the normalized index. Then return `{ index: 0 }` for an empty list as today. Then normalize the index; if normalization changed it, return the normalized index with no movement and no action. The keystroke re-seats a stale selection onto the row the user will now see highlighted rather than acting on a row they never saw selected — Enter must never pick a task or profile the user was not looking at. Otherwise proceed exactly as today. The `if (row.header) return { index }` guard stays only for the degenerate list of headers alone, which a server list never produces but the type allows.

3. **Hooks** (`useTaskPicker`, `useProfilePicker`): add a `useEffect` keyed on the visible rows that runs `setIndex((previous) => normalizeIndex(rows, previous))`. A valid index is returned unchanged, so React bails out of the re-render on the common broadcast where nothing moved. This mirrors `useQueuePicker`'s existing clamp effect. The key-handler normalization in step 2 covers the one render between a list change and the effect.

4. Delete `firstSelectableIndex` and `firstProfileIndex` and the two private `seek` helpers; both hooks and both key modules import from `sectioned-rows.ts`.

Rejected alternative: acting on the normalized row (moving or picking from it) in the same keystroke. It saves a keypress in a rare case but lets Enter pick a row that was not highlighted when the key was pressed.

## Implementation steps

1. Add `web/src/pickers/sectioned-rows.ts` with `firstSelectable`, `seekSelectable`, and `normalizeIndex`.
2. Re-point `web/src/pickers/task-picker-keys.ts` at it: remove `firstSelectableIndex` and `seek`, handle Escape first, normalize at the top of `handleTaskPickerKey`.
3. Same for `web/src/pickers/profile-picker-keys.ts`: remove `firstProfileIndex` and `seek`, handle Escape first, normalize at the top of `handleProfilePickerKey`.
4. `web/src/pickers/useTaskPicker.ts` and `web/src/pickers/useProfilePicker.ts`: seat the open index with `firstSelectable` and add the re-normalizing effect.
5. Update `product/specs/task-picker.md` and `product/specs/profiles.md`.

## Tests

- `web/src/pickers/sectioned-rows.test.ts` (new): `firstSelectable` skips a leading header and returns 0 for an empty list (moved from the two key test files); `seekSelectable` skips headers in both directions and stays put at an edge; `normalizeIndex` leaves a valid index alone, clamps an index past the end onto the last selectable row, moves a header index forward to the next selectable row, falls back to the previous selectable row for a trailing header, and returns 0 for an empty list or a list of headers alone.
- `web/src/pickers/task-picker-keys.test.ts`: drop the moved `firstSelectableIndex` block; the header-row cases ("is a no-op when the selection is on a header row", "Enter on a header row is a no-op") now assert the selection is re-seated onto the first task with no action; add an index past the end (re-seated, no throw), Escape on a header row (closes), and Escape on an empty list (closes).
- `web/src/pickers/profile-picker-keys.test.ts`: drop the moved `firstProfileIndex` case; add an index past the end, a header index re-seated without picking, and Escape on a header row.
- `web/src/pickers/useTaskPicker.test.ts` and `web/src/pickers/useProfilePicker.test.ts`: re-render the hook with fewer rows while the stored index points past the new end, and assert the index is re-normalized onto a selectable row.

All other existing navigation cases (arrow movement, cross-section skipping, expand/collapse/parent, Enter picking, dispatch glue) stay unchanged and must keep passing.

## Out of scope

- Keeping the selection on the *same* task or profile by identity when the list shifts. The index re-clamps by position, which may land on a neighbouring row; that is visible but harmless, and tracking identity would change the hooks' state shape.
- How often the server rebuilds the lists (a separate backlog item caches those directory walks).
- The history, queue, theme, quick-open, and tab-navigation pickers, which are not sectioned.
