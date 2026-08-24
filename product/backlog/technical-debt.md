# technical-debt

## ready

* `src/protocol.ts` is 365 lines — nearly double the 200-line guideline in `ai/guidelines/code-guidelines.md` — and holds every tab-view field, RPC method params, and view type across the file-navigator, schedule, monitor, editor, and plugin domains in one `TabView`/`StateEvent`/`RpcCall` union (lines 84-363); it is the highest-churn file in the repo over the last 60 days (84 commits), so every new feature's RPC additions land in the same file. Split it into per-domain files (e.g. file-navigator RPCs, schedule RPCs, editor RPCs) re-exported from `protocol.ts` so unrelated features stop colliding on the same file. Severity: **medium**.

## development

* `src/file-navigator/moves.ts` implements undo/redo for file moves and pastes — `applyStackMove` (lines 50-93) and `applyStackPaste` (lines 165-202) branch across `overwrite-all`/`skip-conflicts` policies and partial success/failure, calling `rmSync(..., { recursive: true })` and `renameSync`/`copyItem` against real files — with no test file covering it; its sole caller `manager-history.ts` also has none, while the sibling `manager-batch.test.ts` only exercises the forward `moveMany`/`pasteMany`/`deleteMany` paths and every other module in `file-navigator/` has a colocated test. Add a test file for `moves.ts` covering the conflict-policy branches and partial-failure paths, following the temp-dir pattern already used in `manager-batch.test.ts`. Severity: **high**.

* `src/harness/command-parse.ts` has no colocated test file even though `parseHarnessCommand` and its helpers (`findFlagValue`, `splitWithClause`, `parseHarnessFlags`, `parseLabelSubcommand`, lines 15-107) parse flags, the `with <prompt>` clause, and `capture`/`transcript` subcommands across several distinct error-return paths, while 11 other files in `src/harness/` (e.g. `auto-approve.ts`, `busy-status.ts`, `capture-file.ts`) all have one. Add `command-parse.test.ts` covering the flag-parsing and error-return branches. Severity: **medium**.

* `src/harness/manager.ts` duplicates a 12-argument positional parameter list for `spawnTab` (lines 154-158) between its two call sites, `open()` (line 127) and `openFromProfile()` (line 143) — several adjacent parameters share a type (`offline`/`autoApprove` both booleans, `model`/`effort` both optional strings), so a transposition of two adjacent args at either call site would compile silently. Introduce a `SpawnTabOptions` object to group these fields so the call sites can't drift out of argument-order sync. Severity: **medium**.

## deferred

## declined
