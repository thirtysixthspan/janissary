# technical-debt

## ready

## development

* `src/file-navigator/moves.ts` implements undo/redo for file moves and pastes — `applyStackMove` (lines 50-93) and `applyStackPaste` (lines 165-202) branch across `overwrite-all`/`skip-conflicts` policies and partial success/failure, calling `rmSync(..., { recursive: true })` and `renameSync`/`copyItem` against real files — with no test file covering it; its sole caller `manager-history.ts` also has none, while the sibling `manager-batch.test.ts` only exercises the forward `moveMany`/`pasteMany`/`deleteMany` paths and every other module in `file-navigator/` has a colocated test. Add a test file for `moves.ts` covering the conflict-policy branches and partial-failure paths, following the temp-dir pattern already used in `manager-batch.test.ts`. Severity: **high**.

* `src/harness/command-parse.ts` has no colocated test file even though `parseHarnessCommand` and its helpers (`findFlagValue`, `splitWithClause`, `parseHarnessFlags`, `parseLabelSubcommand`, lines 15-107) parse flags, the `with <prompt>` clause, and `capture`/`transcript` subcommands across several distinct error-return paths, while 11 other files in `src/harness/` (e.g. `auto-approve.ts`, `busy-status.ts`, `capture-file.ts`) all have one. Add `command-parse.test.ts` covering the flag-parsing and error-return branches. Severity: **medium**.

* `src/harness/manager.ts` duplicates a 12-argument positional parameter list for `spawnTab` (lines 154-158) between its two call sites, `open()` (line 127) and `openFromProfile()` (line 143) — several adjacent parameters share a type (`offline`/`autoApprove` both booleans, `model`/`effort` both optional strings), so a transposition of two adjacent args at either call site would compile silently. Introduce a `SpawnTabOptions` object to group these fields so the call sites can't drift out of argument-order sync. Severity: **medium**.

## deferred

## declined
