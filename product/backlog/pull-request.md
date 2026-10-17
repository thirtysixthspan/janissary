<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's requirement to forget a runscript selection removed from a refreshed catalog.

Existing Issue: `ScheduleDialog` renders reconciled fields from the latest catalog but leaves the unreconciled script in component state and module-level `remembered`, so a later snapshot or reopen can silently select that script again if it reappears. Severity: 4/10

Existing Risk: 4/10 - A script that disappeared and was reported as cleared can become selected again without the user choosing it, allowing a system schedule to be submitted with a silently restored choice.

Proposal Risk: 1/10 - Persisting the cleared selection when reconciliation detects its removal prevents restoration; an incorrect state update would be visible in focused dialog interaction tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "persist cleared runscript selection after catalog refresh". In `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx`, ensure a catalog-driven `reconcileScheduleFields` result that clears `script` is written back to component state and the module-level remembered fields, without resetting the tab command draft or other form values. Extend `web/src/ScheduleLaunchDialog/ScheduleDialog.test.tsx` to remove the selected script, then restore it in a later snapshot and verify the picker remains empty and Schedule stays disabled until the user chooses a script; also cover closing and reopening after the removal.
