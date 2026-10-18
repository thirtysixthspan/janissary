# Shared runscript execution for execute and the scripts tab
**Complexity: 2/10** — a behavior-preserving extraction of one command body into one exported function, with four new test cases and no new module, persistence, or UI surface.

## Goal

Move the body of `execute` that runs after name validation into an exported `runRunscriptNow(managers, name)`. It returns the failure text instead of writing a transcript line. The `execute` command and the scripts tab's execute action then run one code path.

## Design decisions and dependencies

Subplan `01-runscript-file-operations` is complete, so nothing earlier is pending. This subplan reads only the `exists` and `lines` fields of `readRunscript`, not the `text` field that `01` added. It must land before `04-runscripts-topic-and-actions`, which imports `runRunscriptNow`.

- The function returns the text `execute` prints today: `No runscript named "<name>".` when the file is absent, or `Could not read runscript "<name>".` when `readRunscript` throws. Every throw from `readRunscript` maps to the read-failure text: a symlinked or non-regular file, an unreadable file, a symlinked `.janissary` or `scripts` directory, and an invalid name. On success it returns nothing. Rejected: throwing for failures. The command and the feed both need the text.
- When the system shell is not ready, the function returns nothing, enqueues nothing, and adds no text of its own. Every failed status from `ensure()` except the disposed case has already gone through `fail()` in `src/system-shell.ts`, which calls `notifySystemShellStartFailure` in `src/schedule/system/notices.ts`, so the shell reports the failure itself. The disposed case (the `disposed` check at the top of `ensure`) returns failed without a notice. `execute` is silent there today, and this plan keeps it silent. `ensure()` does not reject, because its internal errors become a failed status, so the function needs no try/catch around it.
- The command keeps its own usage check. `isRunscriptName` from `src/schedule/system/runscript.ts` decides it, and the `Usage: execute <name>` text is appended with `appendCommandOutput` from `src/command/append.ts`, with the typed command as `input`. The function does not repeat the name check. Callers validate first, and an unvalidated name that reaches the function fails inside `readRunscript` and returns the read-failure text.
- The order inside the body stays: read the runscript with `managers.tab.launchDir` as the project root, check that it exists, ensure the system shell, and enqueue the lines to `system`. The existence check still comes before the shell starts, so a missing file never starts the shell.
- The function does not move focus itself. The source plan's rule that the system shell is not brought into view on success is current `execute` behavior. It comes from `ensure` in `src/system-shell.ts`: a newly opened system tab is hidden at once by `userCloseTab` (the call right after `opened.systemShell = true`), and a live shell that already exists is returned without a focus change. This extraction leaves that code alone. Subplan `10`'s manual walk checks that the lines run but not that focus stays put. So the focus step is part of this plan's Verification for the command, and subplan `10` needs the same step for the scripts tab.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| The execute command | `src/commands/execute.ts` | Its body after validation becomes `runRunscriptNow`. The command keeps the same registry shape. |
| Runscript read | `src/schedule/system/runscript-files.ts` (`readRunscript`) | Called unchanged with `managers.tab.launchDir`. The function reads its `exists` and `lines` fields. |
| System shell start | `src/system-shell.ts` (`SystemShellManager.ensure`) | Called unchanged. Returns `{ status: 'ok', tab }` or `{ status: 'failed', reason }`, the `SystemShellEnsureResult` type. |
| System batch enqueue | `src/tab/queue-state.ts` (`enqueueSystemBatch`) | Called unchanged as `managers.tab.enqueueSystemBatch('system', lines)`. `TabManager` inherits it from `TabQueueState`, and it does nothing when the lines are empty. |
| Usage check and output append | `src/schedule/system/runscript.ts` (`isRunscriptName`), `src/command/append.ts` (`appendCommandOutput`) | Both used by the command body, unchanged. |
| Manager type | `src/managers.ts` (`Managers`) | The type of the `managers` parameter. `CommandManagers` in `src/commands/types.ts` is an alias of it. |

## Proposed changes

In `src/commands/execute.ts`, export `runRunscriptNow(managers, name)`, typed with `Managers` from `src/managers.ts`, which returns a promise of the failure text or `undefined`. Place it above `export const command`, so the command reads as validation followed by the shared call. The `run` function of the command validates the name, then awaits `runRunscriptNow`. When the result is text, it calls `appendCommandOutput` with `tab.label`, the entry `{ input: command_, output: text }`, and the `invocation` argument, the same shape today's appends use. The usage append keeps its own call. The order of checks does not change. The file has 36 code lines today (39 physical lines, blank lines not counted), and the extraction keeps it far below the 200-line limit.

Nothing else changes. No new module is needed, and the command's exported `command` object keeps its name, match, samples, and run signature.

## Tests

In `src/commands/execute.test.ts`:

- All five existing cases in `src/commands/execute.test.ts` pass unchanged: the shell is ensured and the lines enqueued as one batch, an empty script adds no rows, a missing script is reported without ensuring the shell, invalid names are rejected, and a failed shell start leaves the queue unchanged. The execute routing cases in `src/commands.test.ts` (the `availableCommands` list and the `execute command routing` block) also pass. `src/commands/commands.test.ts` covers `getOutput` and does not name `execute`, so it is not affected.
- A new case calls `runRunscriptNow` with a name whose file is absent and expects `No runscript named "<name>".`.
- A new case creates `.janissary/scripts/<name>.rs` as a symlink to a real file in the same temporary root, using `symlinkSync` as `src/schedule/system/runscript-files.test.ts` does, and expects `Could not read runscript "<name>".`.
- A new case uses a present runscript with the `setup` helper's `ensure`, which returns `{ status: 'ok', tab: {} }` to match the `SystemShellEnsureResult` shape. It expects `undefined`, and it expects the enqueue to record the label `system` with the file's lines. The helper's `enqueueSystemBatch` currently drops the label (`_label`), so `setup` records the label in a new list that it returns. The existing assertions read only `batches`, so they do not change.
- A new case makes `ensure` return `{ status: 'failed', reason }`, as the existing failure case does, and expects `undefined` and no enqueue. The existing case covers the command's queue, and this one covers the return value.

The file uses vitest `describe`, `it`, and `expect`, a real temporary directory from `mkdtempSync` under `tmpdir()` that `afterEach` removes, and a `setup` helper that returns fake `managers` cast with `as never`. New cases use that helper and that style.

## Verification

Run `./scripts/run.mjs check-diff`. Because this is a refactor, read the diff of `src/commands/execute.ts` and confirm that the messages, the order of checks, and the `appendCommandOutput` inputs are the same as before.

Then do a manual check in a project with a runscript named `deploy` that holds one harmless `echo` line. Type `execute deploy`: the line runs in the system shell, and the active tab does not change. Type `execute missing`: the transcript shows `No runscript named "missing".`. Type `execute ../deploy`: the transcript shows `Usage: execute <name>`. Then create `.janissary/scripts/link.rs` as a symlink to `deploy.rs` and type `execute link`: the transcript shows `Could not read runscript "link".`

## Out of scope

- No change to `edit`, `create script`, or the `execute` output wording.
- No topic action or feed call here. The scripts tab's execute action is in `04-runscripts-topic-and-actions`.
- No change to the runscript grammar, the catalog, or the system shell.
- `src/schedule/system/firing.ts` (`fireSystemBatch`) repeats the read-then-ensure order for scheduled runs. It stays as it is and does not call `runRunscriptNow`, because it writes a read failure to stderr instead of a transcript line, treats a missing file as a schedule advance rather than an error, and enqueues with the schedule key.
- `src/commands/edit.ts` and `src/commands/schedule.ts` keep their own copies of the two failure texts, because `edit` opens an editor and `schedule` records a schedule rather than running one.
- `src/commands/create.ts` (`create script`) is not touched.
