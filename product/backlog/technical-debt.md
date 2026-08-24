# technical-debt

## ready

* `src/harness/command-parse.ts` has no colocated test file even though `parseHarnessCommand` and its helpers (`findFlagValue`, `splitWithClause`, `parseHarnessFlags`, `parseLabelSubcommand`, lines 15-107) parse flags, the `with <prompt>` clause, and `capture`/`transcript` subcommands across several distinct error-return paths, while 11 other files in `src/harness/` (e.g. `auto-approve.ts`, `busy-status.ts`, `capture-file.ts`) all have one. Add `command-parse.test.ts` covering the flag-parsing and error-return branches. Severity: **medium**.

* `src/harness/manager.ts` duplicates a 12-argument positional parameter list for `spawnTab` (lines 154-158) between its two call sites, `open()` (line 127) and `openFromProfile()` (line 143) — several adjacent parameters share a type (`offline`/`autoApprove` both booleans, `model`/`effort` both optional strings), so a transposition of two adjacent args at either call site would compile silently. Introduce a `SpawnTabOptions` object to group these fields so the call sites can't drift out of argument-order sync. Severity: **medium**.

## development

## deferred

## declined
