<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's stale commit and changed-file counts so its verification statement matches the branch head.

Existing Issue: The description says the branch carries 58 commits and 263 changed files from `139aaf43`, while the current head carries 60 commits and 264 changed files. Severity: 2/10

Existing Risk: 2/10 - A reviewer checking the branch statistics sees a mismatch and may distrust the verification statement around it, though no behavior is affected.

Proposal Risk: 1/10 - The count can go stale again as soon as another commit lands, so the update must derive the numbers at the final pushed head rather than hard-coding them.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "resync the pull request description's commit and changed-file counts". Read the Summary paragraph through `gh pr view 1916 --json body`, then replace only the sentence beginning "As of this head the branch carries" with counts from `git rev-list --count 139aaf43..HEAD` and `git diff --shortstat 139aaf43...HEAD` at the final pushed head. Leave every other paragraph byte-for-byte unchanged, including the Verification and Manual acceptance status sections, and do not claim the full suite was rerun. Re-read the body from GitHub after `gh pr edit` and confirm PR #1916 is still open. No code, test, spec, plan, or backlog file changes are involved.


* Cover the record-tab open ordering and loaded-window refresh so the repaired flow cannot regress untested.

Existing Issue: `src/plugins/connections/record-tabs.ts` now opens or focuses a record tab before requesting its window and then refreshes the tab through `updateTab`, but the record-open cases in `src/plugins/connections/activate.test.ts` and `src/plugins/connections/command.test.ts` still describe the opposite order and assert only that both calls happened, with fixtures that never return a loaded window. Severity: 3/10

Existing Risk: 3/10 - A later change that restores the old request-before-open order would let the new prune drop the request and open the tab without its window, while every existing test still passes.

Proposal Risk: 1/10 - The added assertions pin the current order and refresh, and need updating only if the open flow is deliberately redesigned.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "cover the record-tab open ordering and loaded-window refresh". In `src/plugins/connections/activate.test.ts`, replace the `opens a durable record after requesting its newest window` case with a fixture whose `topicData` returns the record without a window until the `load` action is recorded, then returns it with a 20-block window; assert `openOrFocusTab` is called before the `load` topic action and that `updateTab` receives the refreshed record carrying that window. Apply the same correction to the record-open case in `src/plugins/connections/command.test.ts`, keeping its existing rejection, lookup, and live-row assertions. No production behavior changes. Run `npm run test:server -- src/plugins/connections/activate.test.ts src/plugins/connections/command.test.ts`, and confirm the new assertions fail against the old request-before-open order and pass against the current code.
