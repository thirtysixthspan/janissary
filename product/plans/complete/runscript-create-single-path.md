# Build the created runscript path with the shared helper
**Complexity: 1/10** — one line in one function, with the same value computed by the same pure helper that `readRunscript` already uses.

## Goal

`createRunscript` in `src/schedule/system/runscript-files.ts` builds its target path with its own join of the scripts directory, the name, and the `.rs` suffix. The commit that added `runscriptFilePath` meant the runscript path to have one definition, and `readRunscript` already uses it. Route `createRunscript` through the same exported helper so the `<name>.rs` rule lives in one place. No behavior changes.

## Design decisions and dependencies

`runscriptFilePath(projectRoot, name)` is a pure `path.join` over the runscripts directory and `${name}.rs`. It touches no file system state and runs no Git step, so calling it from `createRunscript` at the point where the path is computed today produces the identical string and does not change when the Git exclusion, the directory check, or the directory creation happens.

The order inside `createRunscript` stays as it is: `isRunscriptName` first, then the target path, then `scriptsDirectory` (which runs the Git exclusion and checks the directories), then `makeScriptsDirectory` when the directory is missing, then `createExclusive`, then `readRunscript` when the exclusive create reports an existing entry. The path is computed in the same position, so no check or call moves.

`newUntitledRunscript` is left alone. Its `untitled.rs` seed is passed to `nextFreeName` and reaches the path through `createRunscript`, so it does not build a second path. `cloneRunscript` is not covered by this plan. Before `runscript-clone-single-path`, it built its candidate as a `${name}.rs` template literal ahead of `nextFreeName`, a second spelling of the rule beside `runscriptFilePath`, and that fix routes the candidate through the helper.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this plan uses it |
| --- | --- | --- |
| Runscript path helper | `src/schedule/system/runscript-files.ts` (`runscriptFilePath`, exported) | Called by `createRunscript` in place of the inline join. `readRunscript` already calls it. |
| Create, exclusive write, directory checks | `src/schedule/system/runscript-files.ts` (`createRunscript`, `createExclusive`, `scriptsDirectory`, `makeScriptsDirectory`) | Unchanged apart from the one path line. |

## Proposed changes

In `src/schedule/system/runscript-files.ts`, in `createRunscript`, replace the line that builds the target from `path.join(runscriptsDirectoryPath(projectRoot), `${name}.rs`)` with `const file = runscriptFilePath(projectRoot, name);`. Keep its position after the `isRunscriptName` check and before the `scriptsDirectory` call. No other line in the file changes, and no exported signature changes.

## Tests

No test is added or edited. The behavior is identical, and the existing cases cover the code that changes:

- `creates a missing scripts directory and an empty runscript in it` checks the returned `file` path for a created runscript.
- `keeps an existing runscript unchanged and reports that it was not created` checks the returned `file` path for an existing runscript.
- `refuses an invalid name without creating anything` checks the name guard that runs before the path is built.
- `refuses to create through a symlinked scripts directory or a symlinked target` checks the directory and target refusals.
- `computes the runscript file path without creating the directory or writing a Git exclusion` checks `runscriptFilePath` itself.

A new test would pin the source text rather than behavior, so it is not added.

## Verification

Run `./scripts/run.mjs check-diff` after the change. All existing tests must pass without edits. Confirm by reading the diff that the only changed line is the path computation in `createRunscript`, and that `cloneRunscript` and `newUntitledRunscript` are untouched.

## Spec and documentation

`product/specs/` describes user-visible behavior, and that behavior is unchanged, so no spec is updated. `help.md` and `documentation/user-documentation/` describe nothing that changes, so no documentation is updated.

## Out of scope

- `newUntitledRunscript`, which reaches the path through `createRunscript` and stays as it is.
- `cloneRunscript`, whose candidate spelling is fixed in `runscript-clone-single-path`.
- Any exported signature, any other file, and any test file.
- Any change to the `<name>.rs` rule itself, the name grammar, or the Git exclusion behavior.
