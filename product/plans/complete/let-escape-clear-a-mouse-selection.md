# Let Escape clear a selection the mouse started

**Complexity: 2/10** — an early return in one key handler, and the cases that pin it. No behaviour
change for any key the grid already answered.

## Goal

Escape leaves the grid's selection alone unless a cell cursor happens to be set, so a cell chosen by a
click stays marked and a whole-row run built with `Shift` and an arrow key stays marked, while the
same run clears once an arrow key has been pressed first. `product/specs/sql-database.md` says
"`Escape` leaves the grid with nothing marked at all, whichever way it was marked."

## Approach

`useGridKeys` in `web/src/plugins/sql/sql-keys.ts` answers Escape with `if (!cursor) return;`, so it
never reaches `onClear` — and the range a mouse run sets lives in `useGridSelection`, which is the
other half of the state. The guard is there so Escape is not swallowed when the grid holds nothing to
clear; it is answering the wrong question, because a run started with the mouse has marked cells
without a cursor.

`edgeRow` is already derived from the range (`selection.range?.to.row ?? null`) and handed to the hook
precisely so it can tell the two apart, so the handler has what it needs: clear the cursor and the
selection in every case, and only `preventDefault` when something was actually marked — which keeps
Escape reaching the host when the grid is empty, as it does today.

## Implementation steps

1. `web/src/plugins/sql/sql-keys.ts`, the Escape branch of the window listener.
2. `product/specs/sql-database.md`, **Editing**: the sentence stays as it is — the code is what is
   wrong here — so nothing changes.

## Tests

- `web/src/plugins/sql/Selection.test.tsx`, beside the existing run cases: a click that starts a run and
  then Escape leaves nothing marked; a `Shift`+`ArrowDown` row run with no cell cursor and then Escape
  leaves nothing marked. The existing `ArrowDown`, `Shift`+`ArrowDown`, Escape case keeps the path
  that already worked, so the change cannot cost it.

## What was checked and left alone

- `Escape` with nothing marked still does not `preventDefault`, so a drawer above the grid keeps
  closing on it.
- The copy chord is a separate window listener in `useGridSelection` and is untouched.
- `Tab` remains the host's, as the spec requires.
