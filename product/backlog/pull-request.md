<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that the system schedule grammar remains unshipped.

Existing Issue: The PR body says the schedule grammar remains planned and not shipped, although this commit implements the parser, command routing, profile isolation, completions, specs, help, and user documentation for it. Severity: 4/10

Existing Risk: 4/10 - Readers may believe the feature still lacks its grammar and miss the behavior now delivered by this commit.

Proposal Risk: 2/10 - The description accurately distinguishes the shipped grammar from the still-planned UI and browser E2E work, while any broader implementation gap remains visible for later review.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "correct the description's claim that the system schedule grammar remains unshipped". Update the PR body's statements that the schedule grammar is still planned and not shipped to say that commit `0ddf685e` delivers system schedule grammar, command routing, profile isolation, and grammar-aware completion, while the schedules UI and browser E2E remain planned. Reconcile both the overview and the "How to verify" section so they do not contradict the current implementation commit; preserve the broader-plan scope and acceptance scenarios. Verify the edited body against `src/schedule/index.ts`, `src/commands/schedule.ts`, `src/profile/harness-schedule.ts`, and `src/completion/system-schedule.ts` without changing implementation files.
