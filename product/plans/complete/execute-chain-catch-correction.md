# Execute chain catch correction
**Complexity: 1/10** — a record-only correction. The code already carries the catch, and this plan states the correction in place of subplan 04's no-catch statement and adds the shipped feed line to that subplan's feed-text list.

## Goal

Make the record match the shipped execute chain. `product/plans/complete/04-runscripts-topic-and-actions.md` says the execute chain needs no catch of its own, and its feed-text list has no line for a rejected run. The code now ends the chain in a catch that posts `Could not run runscript "<name>".` to the notifications feed. Without this correction, the scripts-tab spec that subplan 09 writes from subplan 04 would omit that line and its open owner confirmation.

## Design decisions

- No source, test, or spec changes. The code is already correct and the existing tests pin its behavior. This plan is the recorded correction.
- Subplan 04 is a completed plan and is not edited by this run. Its Design decisions sentence that says `ensure()` does not reject, "so the chain needs no catch of its own", is superseded by this plan. The Update step folds the correction into subplan 04 later.
- The current behavior, verified in the code:
  - The execute arm in `src/plugins/runscript-topic-actions.ts` chains `runRunscriptNow` with a `.then` that posts any non-`undefined` result and a `.catch` that calls `reportCause('execute', error, action.name)` and then `postRunFailure`.
  - `postRunFailure` posts `failed('run', name)`, which produces `Could not run runscript "<name>".`, inside its own try. Its catch writes the cause to stderr through `reportCause`, so a broken feed still leaves the cause in the server log.
  - The chain can reject after `ensure()` succeeds. `runRunscriptNow` in `src/commands/execute.ts` calls `managers.tab.enqueueSystemBatch` after `systemShell.ensure()` resolves with status `ok`, and that call has no try of its own. A throw from the feed post in the `.then` is caught by the same catch.
  - Subplan 04's stated reason is incomplete. `ensure()` in `src/system-shell.ts` turns errors raised inside `ensureShell` into a failed status, but nothing guards the enqueue step after it, so the chain needs the catch.
- The wording `Could not run runscript "<name>".` is new and is not in subplan 04. It joins subplan 04's feed-text list after the execute entry, flagged for owner confirmation alongside the directory wording `Could not use the runscripts directory.`. The repair plan `product/plans/complete/runscripts-execute-rejection-feed.md` remains the record of that wording decision.

## What already exists

| Existing piece | Where | How this plan uses it |
| --- | --- | --- |
| Execute arm with its `.then` and `.catch` | `src/plugins/runscript-topic-actions.ts` | Cited as the current behavior. Not changed. |
| `postRunFailure`, `failed`, `reportCause` | `src/plugins/runscript-topic-actions.ts` | Cited for the wording and the stderr cause. Not changed. |
| `runRunscriptNow` | `src/commands/execute.ts` | Cited as the source of the enqueue rejection. Not changed. |
| `systemShell.ensure` | `src/system-shell.ts` | Cited for its failed-status behavior. Not changed. |
| Rejection cases | `src/plugins/runscript-topic-actions.test.ts` | Cited as the existing pins on the text. Not changed. |
| Subplan 04 | `product/plans/complete/04-runscripts-topic-and-actions.md` | Superseded here. Not edited. |

## Proposed changes

1. No source file changes.
2. No test file changes.
3. No spec changes.
4. The correction is recorded in this plan's Design decisions: the no-catch statement is superseded, and the feed line joins subplan 04's feed-text list, flagged for owner confirmation.
5. Remove the resolved entry from `product/backlog/pull-request.md` and restore the file to the master skeleton.

## Tests

No test change; the existing rejection cases already pin the behavior. In `src/plugins/runscript-topic-actions.test.ts`, the case `reports a feed-post rejection to stderr and leaves no unhandled rejection` asserts that the second `notify` call carries origin `janus` and the text `Could not run runscript "deploy".`, and that stderr receives the cause. The case `reports a second feed-post rejection to stderr and leaves no unhandled rejection` covers a feed that throws on both posts.

Those cases reach the catch through a throw from the feed post. The enqueue rejection that the subplan's no-catch statement overlooked has no direct case. That gap is noted here and is not closed by this run, because this run changes no tests.

## Verification

- The diff against master shows this plan as the only new tracked file, in `product/plans/complete/`, and `product/backlog/pull-request.md` matches the master skeleton.
- The quoted wording matches `failed('run', name)` in `src/plugins/runscript-topic-actions.ts`, which builds `Could not ${verb} runscript "${name}".` with the verb `run`.
- The existing rejection cases in `src/plugins/runscript-topic-actions.test.ts` still assert the same text.
- No `check-diff` run is needed, because no code changes.

## Spec and documentation

No spec change. `product/specs/scripts-tab.md` does not exist yet, because subplan 09 writes it. When subplan 09 writes it, its feed-text section must carry `Could not run runscript "<name>".` with the owner-confirmation flag recorded here. Help and user documentation need no change, because the feed line is new behavior with no existing documentation.

## Out of scope

- Editing subplan 04, the repair plan, or any source, test, or spec file.
- Changing the wording or the catch. The owner confirms the wording later.
- Adding a direct test for the enqueue rejection path. Any such test is a separate change.
</content>
