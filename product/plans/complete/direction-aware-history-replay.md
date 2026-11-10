# Direction-aware history replay
**Complexity: 4/10** — ~40 added lines, 3 files, 4 requirements, 7 scenarios (p=4.91)

## Goal

Express undo and redo replay once, in terms of a direction-aware view of a history step, instead of re-deriving the flipped `from`/`to` sides and the from/to stacks at every use.

## Approach

- In `src/file-navigator/moves.ts` add `stepMoves(step, direction)`, a pure function returning `{ from, to }[]` pairs for a move group (`entries`) or a cut paste group (`pairs`), swapped for undo. A copy paste group returns an empty list, because a copy moves nothing.
- In the same file add `stacksFor(state, direction)` returning `{ fromStack, toStack }`.
- In `src/file-navigator/manager/mutations.ts`, `replayMutation` uses `stepMoves` for the pre-flight refusal list (the `from` sides) and for the `pathsMoved` argument, and `stacksFor` for the stacks.
- In `src/file-navigator/manager/history.ts`, `replayHistory` uses `stacksFor`.
- `applyStackMove` and `applyStackPaste` internals stay as they are.

## Tests

- `stepMoves` for undo and redo of a move group and of a cut paste group, plus an empty result for a copy paste group.
- `stacksFor` for both directions.
- `replayMutation` notifies `pathsMoved` with the reversed pairs after a cut-paste undo, and refuses when a source is a live transcript.

## Out of scope

- The internals of `applyStackMove` and `applyStackPaste`.
- The remote filesystem port replay.
