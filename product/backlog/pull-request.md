<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Resolve the technical debt of stale two-field system-schedule completion options left in tests after the contract gained required name lists.

Existing Issue: SystemScheduleCompletions now requires activeRecurringNames and pausedNames, but six runscript-completion calls and one disabled-command-guard object in src/completion/index.test.ts still pass the old { names, scripts } shape, so those call sites no longer satisfy the declared contract. Severity: 4/10

Existing Risk: 4/10 - Because test files are excluded from the typecheck config and the completer defaults the missing lists to empty, the mismatch stays invisible until a later completer reads the new fields directly, at which point those test paths fail instead of being caught when the contract widened.

Proposal Risk: 1/10 - Every system-schedule options object then carries all four fields, so the declared contract holds at each call site and the completer's empty-list fallbacks become harmless redundancy rather than a cover for stale callers.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "update system-schedule completion test options to the widened contract". In src/completion/index.test.ts, add activeRecurringNames: [] and pausedNames: [] to every systemSchedule options object passed as the seventh argument of completeCommandLine: the six literals in the runscript-completion tests covering execute and edit, and the scripts object in the disabled-command guard test's cases loop. Leave each object's existing names and scripts values unchanged so those tests keep exercising the same runscript completion. Verify by reading the file back to confirm every seventh-argument object has all four fields and by running the server test for src/completion/index.test.ts in the work task.
