# Unify the file-navigator replay protocol

**Complexity: 5/10** — the refactor centralizes conflict preflight, policy handling, partial-success bookkeeping, and result construction for two existing replay kinds. Filesystem behavior and wire shapes stay unchanged, and both paths already have focused coverage.

## Goal

Make move and paste undo/redo use one replay protocol so conflict handling, skip/overwrite policy, stack transitions, partial failures, rebuilds, and result shapes cannot drift independently.

## Approach

Extract a generic `applyReplayProtocol` module. A replay adapter supplies the original group order, execution order, a source/destination/conflict/failure-path leg for each item, the concrete filesystem action, and a function that rebuilds the kind-specific history step. The protocol owns all shared decisions.

Move replay supplies root-relative legs and reverses execution for undo. Paste replay supplies absolute pair legs. Copy undo uses the same protocol with conflict preflight disabled and a delete action, so its formerly separate stack-bookkeeping function is removed too.

## Implementation steps

1. Add `src/file-navigator/replay-protocol.ts` with generic leg/adapter types and the shared conflict, execution, bookkeeping, rebuild, and failure-result flow.
2. Replace `applyStackMove`'s private preflight, perform, and stack code with a small adapter passed to the shared runner.
3. Replace `applyStackPaste`, `performPasteReplay`, `pasteReplayResult`, and `undoCopyPaste` with one paste adapter, selecting copy, move, or delete as the concrete action while preserving all current ordering and result paths.

## Tests

- `src/file-navigator/moves.test.ts` must keep passing its direct paste cases for plural conflicts, skip, overwrite, recursive copy undo, and partial failure.
- `src/file-navigator/manager.test.ts` must keep passing the move-side grouped conflict, skip, overwrite, undo ordering, redo, and partial-failure cases.
- Run `./scripts/run.mjs check-diff` after the extraction and adapter conversion.

## Out of scope

- Changing any conflict, failure, ordering, or undo/redo behavior.
- Changing history-entry shapes or the shared wire protocol.
- Adding identity protection before copy undo deletes a destination.
- Moving manager-level tests into the colocated replay test file.
- Updating specs, `help.md`, or public documentation because this is a pure refactor and the existing specs remain accurate.
