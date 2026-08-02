# Shared Undo/Redo Result Contract

**Complexity:** 3/10

## Goal

Make the file navigator's undo/redo RPC result a single shared wire contract so the server and web client cannot drift when conflict payloads change.

## Approach

Move `MoveConflict` and `UndoRedoResult` beside the other file-operation result types in `src/protocol.ts`. Server history code and the web hook will import the same types directly from that module, and the hook's field-for-field local declaration will be removed. This is a type-only consolidation with no runtime behavior change.

## Implementation Steps

### 1. Define the shared result

- Add exported `MoveConflict` and `UndoRedoResult` types to `src/protocol.ts` beside `BatchResult` and `BulkMoveResult`.
- Keep the existing optional batch envelope because empty history returns `{}`, single-item conflicts return `conflict`, and grouped conflicts return `conflicts`.

### 2. Route every consumer through the shared contract

- Remove the local `MoveConflict` and `UndoRedoResult` definitions from `src/file-navigator/moves.ts` and import `UndoRedoResult` from `src/protocol.ts`.
- Update `src/file-navigator/manager-history.ts` and `src/file-navigator/manager.ts` to import `UndoRedoResult` from `src/protocol.ts` instead of through `moves.ts`.
- Update `web/src/useFileNavigatorMoveOperations.ts` to import `UndoRedoResult` from `@shared/protocol` and delete its mirrored declaration.

### 3. Record the conflict behavior

- Update `product/specs/file-navigator-tab.md` to state the single-item undo/redo conflict behavior alongside the existing grouped-conflict behavior.
- Leave `help.md` and public user documentation unchanged because the observable controls and conflict behavior do not change and are already documented.

## Tests

- No new runtime cases are needed for this type-only consolidation. Existing server file-navigator tests cover empty, successful, single-conflict, and grouped-conflict undo/redo results; existing web file-navigator tests cover consuming single undo and redo conflicts and retrying them.
- Run `./scripts/run.mjs check-diff` after the type move and after the spec/backlog changes. Because the change touches both `src/` and `web/src/`, the gate runs the affected server and web suites plus both typechecks.

## Out of Scope

- Changing undo/redo response fields or conflict behavior.
- Adding tests for the hook's broader conflict state machine; that remains a separate technical-debt item.
- Moving non-wire history types such as `MoveEntry`, `MoveGroup`, or `HistoryStep` into the protocol.
