# Cover paste replay branches

**Complexity: 3/10** — this adds one colocated test file around an existing exported function. It exercises filesystem effects and both history stacks, but changes no production behavior or architecture.

## Goal

Pin the paste half of file-navigator undo/redo replay under grouped conflicts, both conflict policies, recursive copy undo, and partial failure so later protocol refactors cannot silently drift from the move path.

## Approach

Drive `applyStackPaste` directly with temporary files and explicit source/destination history stacks. Each test will assert the filesystem result, returned conflict or failure shape, source-stack remainder, destination-stack successes, and rebuild count. This keeps the replay protocol visible without reaching it indirectly through the much larger manager fixture.

## Implementation steps

1. Add `src/file-navigator/moves.test.ts` with temporary-directory setup and small pair/group helpers.
2. Cover plural conflict preflight with no mutation, `skip-conflicts` retaining the skipped pair, and `overwrite-all` replacing every conflicting destination.
3. Cover recursive copy undo and a copy redo where one vanished source fails while the successful pair moves to the opposite stack and the failed pair remains retryable.

## Tests

- `src/file-navigator/moves.test.ts` adds five direct cases for plural conflicts, skip, overwrite, recursive deletion, and partial-failure bookkeeping.
- Run `./scripts/run.mjs check-diff`; the existing manager replay cases must continue to pass unchanged.

## Out of scope

- Refactoring the duplicated move and paste replay protocols. That is the next separate technical-debt item.
- Changing conflict, failure, or stack semantics.
- Protecting edits made after a copy-paste from deletion during undo; that declined item requires new identity semantics.
- Moving existing manager tests into the new file.
- Updating specs, `help.md`, or public documentation because observable behavior does not change and the existing file-navigator spec already describes these branches.
