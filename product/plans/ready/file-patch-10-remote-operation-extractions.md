# File patch 10: make room in the remote operation table, and share the base64 text check

**Complexity: 2/10** — ~50 moved lines into one new module, 3 files edited, 2 requirements, no new behavior to test (p=4.24)

Run order: 10 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on nothing in the series. It sits here because subplan 11 needs both of its moves.

This subplan is a pure refactor that clears the way for the `apply-patch` operation. It changes no behavior. It moves two inline descriptors out of the operation table, which is at the 200-line edge, and moves the base64 UTF-8 text decoder to the shared argument-check module so a second operation can import it.

## Goal

`src/remote/filesystem/operations.ts` has room under `max-lines` for one more mutation operation, and `decodeBase64Text` is importable from `src/remote/filesystem/argument-checks.ts`.

## Design decisions

From the source plan:

- **Shared decoder.** `decodeBase64Text` moves from `src/remote/filesystem/edit-file-operation.ts` into `src/remote/filesystem/argument-checks.ts`, and `edit-file-operation.ts` imports it from there. Subplan 11's `apply-patch` imports it too.

Decided here:

- **Why the table needs room.** `src/remote/filesystem/operations.ts` is at 198 counted lines today (measured with the repo's `max-lines` rule: blank and comment lines skipped), against the 200 limit. One import and a one-line table entry for `apply-patch` would push it to the limit, and any wrapped entry over it. Per `ai/guidelines/code-guidelines.md`, the fix is extraction, never compaction.
- **What moves.** The inline `move` and `move-many` entries of `MUTATION_OPERATIONS` (the `move: descriptorFor<'move'>()({` and `'move-many': descriptorFor<'move-many'>()({` blocks, 27 counted lines together) move into a new `src/remote/filesystem/move-operations.ts`, exporting `moveOperation` and `moveManyOperation`. `MUTATION_OPERATIONS` then lists them as `move: moveOperation` and `'move-many': moveManyOperation`, in the same position after `'edit-file'`, the way it already lists `'write-file': writeFileOperation`. That follows the existing split of `write-file-operation.ts`, `edit-file-operation.ts`, and `glob-paths-operation.ts`. Their `valid`, `decode`, `paths`, `rootDestination`, `refusal`, `decodeResult`, and `run` stay exactly as they are, character for character.
- **The new module's imports.** Do it like `write-file-operation.ts`: `descriptorFor` from `./operation-types.js`, `resultDecoders` from `./result-decoders.js`, `requireBoolean`, `requireString`, `requireStringArray`, `stringArray`, `stringValue`, `policy`, and `optionalPolicy` from `./argument-checks.js`, and `refusedItem` and `refusedMoveMany` from `./refusal-shapes.js`. Relative imports carry `.js`, per the NodeNext rule.
- **Imports left in `operations.ts`.** Only `refusedMoveMany` becomes unused there, so it's the one name dropped from the `./refusal-shapes.js` import. Every `argument-checks.js` name it imports today stays, because the remaining entries still use each one (`requireBoolean` in `rename` and `replay`, `policy` and `optionalPolicy` in `paste`, `stringArray` and `requireStringArray` in `stat`, `delete-many`, `paste`, and `git-commit`), and `refusedItem` stays for `delete`, `rename`, `create-file`, and `create-directory`. Afterwards the file sits at about 172 counted lines.
- **`requireBase64Text` moves too.** It's the throwing companion of `decodeBase64Text`, and `apply-patch` needs it as much as `edit-file` does. Both move into `argument-checks.ts` with their bodies unchanged and both are exported. Place them after `requireBoolean`, beside the other `require*` helpers. `requireBase64Text` throws the module's existing `INVALID_ARGUMENTS` constant, which is the same string as `edit-file-operation.ts`'s private copy. Extend the header comment of `argument-checks.ts` by one clause saying it also holds the base64 UTF-8 text decoder the text-carrying operations share. `argument-checks.ts` goes from 69 to about 85 counted lines.
- **What `edit-file-operation.ts` loses.** Its private `decodeBase64Text`, `requireBase64Text`, and `INVALID_ARGUMENTS` constant are all deleted (the constant has no other use there). Its `./argument-checks.js` import becomes `decodeBase64Text`, `requireBase64Text`, `requireBoolean`, `requireString`, and `stringValue`. `editFileOperation` itself is unchanged.
- **No barrel.** Each importer imports from the defining module (`ai/guidelines/imports-and-barrel-files.md`). Nothing re-exports.
- **Landing.** One commit. The steps keep typecheck green in any order, since each new export exists before its importer is switched.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Split-out descriptors | `src/remote/filesystem/write-file-operation.ts`, `edit-file-operation.ts`, `glob-paths-operation.ts` | Shape for `move-operations.ts`. |
| Argument helpers | `src/remote/filesystem/argument-checks.ts` | New home of the base64 decoder pair, and of the `INVALID_ARGUMENTS` message it throws. |
| Refusal shapes | `refusedItem`, `refusedMoveMany` in `src/remote/filesystem/refusal-shapes.ts` | Imported by `move-operations.ts`. |
| Operation table | `MUTATION_OPERATIONS` in `src/remote/filesystem/operations.ts` | References the extracted descriptors. |

## Proposed changes

- New `src/remote/filesystem/move-operations.ts` with `moveOperation` and `moveManyOperation`.
- `src/remote/filesystem/operations.ts`: import them from `./move-operations.js`, replace the inline descriptors with the two names, and drop `refusedMoveMany` from the `./refusal-shapes.js` import.
- `src/remote/filesystem/argument-checks.ts`: add and export `decodeBase64Text` and `requireBase64Text`, bodies unchanged, and extend the header comment.
- `src/remote/filesystem/edit-file-operation.ts`: import both from `argument-checks.ts` and delete its private copies and its private `INVALID_ARGUMENTS`.

## Tests

- No new behavior, so no new test cases, and no test file changes. These existing tests pin the moved code and must pass unchanged:
  - `src/remote/filesystem/operations.test.ts`: the operation-name list check (`alphabetical(Object.keys(FILESYSTEM_OPERATIONS))`, so the table's key order doesn't matter), the path-extraction cases for `move` and `move-many`, the invalid-argument cases (`move` without `to`, a non-boolean `overwrite`, a bad `move-many` policy, and `edit-file` with `'!!'` or a non-UTF-8 byte), the `move`/`move-many` decode cases including the absent-`overwrite` and absent-`policy` keys, and the `edit-file` decode cases including the kept leading byte order mark.
  - `src/file-navigator/remote/port.test.ts`: the `move` and `move-many` request round trips.

## Verification

- `$janissary/scripts/run.mjs check-diff`, confirming `lint-files` reports no `max-lines` error and no unused-import error on any touched file, and that the server tests above pass.
- No manual check: behavior is unchanged.

## Out of scope

- The `apply-patch` operation itself and the protocol bump (subplan 11).
- Any change to how `move`, `move-many`, or `edit-file` behave.
- Extracting any other inline descriptor from `operations.ts`.
- The unrelated client-side `decodeBase64Text` in `web/src/plugins/shell/shell-command-marker.ts`, which stays where it is. The server and web projects don't share modules this way.
