# Shared runscript execution for execute and the scripts tab
**Complexity: 2/10** — a behavior-preserving extraction from one command, with one new exported function and one new test case.

## Goal

Move the body of `execute` that runs after name validation into an exported `runRunscriptNow(managers, name)`. It returns the failure text instead of writing a transcript line. The `execute` command and the scripts tab's execute action then run one code path.

## Design decisions and dependencies

No earlier subplan is needed. This subplan can land before or after `01-runscript-file-operations`, because it only uses `readRunscript`, which already exists.

- The function returns the text `execute` prints today: `No runscript named "<name>".` or `Could not read runscript "<name>".`. On success, or when the system shell cannot start, it returns nothing. Rejected: throwing for failures. The command and the feed both need the text, and silence when the shell fails is the existing behavior that the source plan keeps.
- The command keeps its own usage check (`Usage: execute <name>`) and keeps appending output with its own `input` text. The function assumes a validated name, and callers validate first.
- The order inside the body stays: read the runscript, check that it exists, ensure the system shell, and enqueue the lines to `system`. The existence check still comes before the shell starts.
- The function does not move focus itself. The source plan's rule that the system shell is not brought into view on success is current `execute` behavior, and it comes from `systemShell.ensure()` and the shell plugin, which this extraction leaves alone. Subplan `10` checks it in the running app for both callers.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| The execute command | `src/commands/execute.ts` | Its body after validation becomes `runRunscriptNow`. The command keeps the same registry shape. |
| Runscript read | `src/schedule/system/runscript-files.ts` (`readRunscript`) | Called unchanged. |
| System shell start | `src/system-shell.ts` (`ensure`) | Called unchanged. Returns a status object. |
| System batch enqueue | `src/tab/queue-state.ts` (`enqueueSystemBatch`) | Called unchanged with the system label. |

## Proposed changes

In `src/commands/execute.ts`, export `runRunscriptNow(managers, name)`, which returns a promise of the failure text or `undefined`. The `run` function of the command validates the name, calls `runRunscriptNow`, and appends the returned text to the transcript with the typed command as its input, exactly as it does now. The file stays well under 200 code lines.

Nothing else changes. No new module is needed, and the command's exported `command` object keeps its name, match, samples, and run signature.

## Tests

In `src/commands/execute.test.ts`:

- All existing `execute` tests pass unchanged. Routing tests in `src/commands/commands.test.ts` also pass.
- A new case calls `runRunscriptNow` with a name whose file is absent and expects `No runscript named "<name>".`.
- A new case uses a symlinked runscript and expects `Could not read runscript "<name>".`.
- A new case uses a present runscript with a fake `systemShell.ensure` returning `{ status: 'ok' }`. It expects the function to return `undefined` and the fake `enqueueSystemBatch` to receive the file's lines under the `system` label.
- A new case makes `ensure` return a status other than `ok`. It expects `undefined` and no enqueue.

## Verification

Run `./scripts/run.mjs check-diff`. Because this is a refactor, read the diff of `src/commands/execute.ts` and confirm that the messages, the order of checks, and the `appendCommandOutput` inputs are the same as before.

## Out of scope

- No change to `edit`, `create script`, or the `execute` output wording.
- No topic action or feed call here. The scripts tab's execute action is in `04-runscripts-topic-and-actions`.
- No change to the runscript grammar, the catalog, or the system shell.
