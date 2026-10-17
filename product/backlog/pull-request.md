<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's implementation summary to identify the system-shell profile-isolation change.

Existing Issue: The PR body says the implementation commit delivers the plan 05 client-contract subplan, while reviewed commit 43846aa7 implements plan 06 profile isolation. Severity: 4/10

Existing Risk: 4/10 - Reviewers may assess the wrong scope and miss the profile save, relaunch, and shell-placement behavior in the current commit.

Proposal Risk: 1/10 - A description that identifies the reviewed profile-isolation change makes the PR's current implementation scope clear, though later commits can make that summary stale again.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1729 "correct the stale implementation summary for system-shell profile isolation". Update the PR description's implementation summary to name plan 06, explain that `profile save` omits the managed system shell, relaunch skips authored `system` entries before tab lookup or close, and subjectless shell placement excludes existing managed system and launch shells. Keep the wider plans publication and plan 05 history distinct from the current implementation being summarized. Verify the revised summary against `product/plans/complete/system-schedules-06-system-shell-profile-isolation.md` and the profile changes in `src/profile/save/route.ts`, `src/profile/entry-resolve.ts`, and `src/profile/view-tabs.ts`; do not claim behaviors beyond those paths.
