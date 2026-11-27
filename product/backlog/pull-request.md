<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the documentation gap that leaves the in-app schedule help page without the new system pause and resume verbs.

Existing Issue: The in-app help page for the `schedule` command lists the system list, cancel, and clear forms but says nothing about the new `schedule system pause` and `schedule system resume` verbs, while the scheduling spec and keys help this change adds describe them. Severity: 4/10

Existing Risk: 4/10 - A user who opens the help for `schedule` to stop a recurring project schedule sees no pause verb and cancels the entry instead, losing the schedule and its runscript association to get the same immediate effect.

Proposal Risk: 1/10 - Adding the two forms, a use case, and examples changes no behavior, with only the residual risk that the help prose drifts from the command grammar again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "document the schedule system pause and resume verbs in the in-app schedule help page". In help/schedule.md, add `schedule system pause <name>` and `schedule system resume <name>` to the Usage block beside the existing system management forms, extend the use-case bullet that currently lists scheduling, listing, cancelling, and clearing project-owned schedules to include pausing and resuming recurring ones, and add one example for each verb; also note that `pause` and `resume` are reserved management words immediately after `schedule system`, as product/specs/scheduling.md now states. Make no source changes: src/commands/schedule.ts and src/schedule/index.ts already implement the verbs, and the command tests in src/commands/schedule.test.ts cover the success, no-match, already-paused, and save-failure paths and must keep passing.
