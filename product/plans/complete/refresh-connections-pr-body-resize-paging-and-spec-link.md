# Refresh the connections pull request body's head counts, resize paging text, and spec link

**Complexity: 2/10** — a description-only correction spanning one counts sentence, two history-paging passages, and one pinned spec link, plus the required plan-and-backlog bookkeeping; no production, test, spec, help, or user-documentation change.

## Goal

Resolve PR #1916's recorded finding: "Correct the pull request description's stale head count, paging text, and connections-tab spec link after the final resize fix."

The body still reports 89 commits and 288 changed files from `139aaf43`, while the review base already carried 90 commits and 288 changed files and this fix's bookkeeping commit advances both again. Its record-tab paragraph and "Record history and paging" verification step describe automatic older-history loading while the loaded history fits the viewport but do not name the viewport-resize trigger that the final repair commit adds. Its `product/specs/connections-tab.md` link pins `73bbc4c6`, which predates the resize sentence. Replace those passages and that link, leaving the ACP-records spec link, the subplan pins, the manual acceptance table, the M7 blocked row, the PR title, and every other paragraph byte-for-byte unchanged.

## Approach and evidence

- `product/specs/connections-tab.md` at `8a099153` adds exactly one sentence clause to the paging passage: older blocks load "automatically while the loaded history fits the viewport, including when a resize makes it fit, until the history scrolls or no older blocks remain." Its other content is unchanged from `73bbc4c6`.
- The resize repair is the focused commit `8a099153 fix(connections): load older history after a viewport resize`, which observes the history element and requests the existing older page when a resize leaves an active, paged record's loaded history fitting the viewport. The once-per-offset guard prevents repeats.
- The record-tab paragraph currently reads: "It opens with the newest 20 blocks, loads 20 older blocks at the top while preserving the viewport, and keeps loading older blocks automatically while the loaded history still fits the viewport, until the history scrolls or no older blocks remain." Add the resize trigger without disturbing the rest of the paragraph.
- The "Record history and paging" step currently asks the reader to confirm automatic loading "On a tall viewport ... until it fills or no older blocks remain." Add that resizing a shorter viewport taller so the loaded history fits triggers the same automatic older-block loading, while a record with enough blocks still requires the top-scroll check.
- The only authority for the counts is the checked-out branch at its final pushed head. Take the commit count from `git rev-list --count 139aaf43..HEAD` and the changed-file count from `git diff --shortstat 139aaf43...HEAD` after the bookkeeping commit is pushed, because that commit advances both.

## Implementation steps

1. Write this plan to `./product/plans/draft/`, then move it to `./product/plans/ready/`.
2. Remove only the resolved entry from `./product/backlog/pull-request.md`. It is the only entry, so restore the file to the exact comment-and-heading skeleton.
3. Move the plan to `./product/plans/complete/`.
4. Run `$janissary/scripts/run.mjs check-diff` (no source checks are expected for a Markdown-and-backlog-only diff) and `git diff --check`.
5. Commit the plan and backlog bookkeeping with `$janissary/scripts/run.mjs pr-commit`, then push through the branch upstream.
6. At the pushed head, run `git rev-list --count 139aaf43..HEAD` and `git diff --shortstat 139aaf43...HEAD`.
7. Read the current body with `gh pr view 1916 --json body`, then make only these changes in `./temp/pr-body.md`: replace the counts in the "As of this head" sentence; add the resize trigger to the record-tab paragraph and the "Record history and paging" step, noting that a record with enough blocks still needs the top-scroll check; repoint the `product/specs/connections-tab.md` link in "Specs, docs, and tests" from `73bbc4c6` to `8a099153`. Leave the ACP-records spec link, the subplan pins, the manual acceptance table, the M7 blocked row, and every other paragraph unchanged.
8. Apply the body with `gh pr edit 1916 --body-file ./temp/pr-body.md`, re-read it from GitHub, and confirm the PR remains `OPEN` with `headRefOid` equal to `git rev-parse HEAD`.

## Tests and verification

- No code tests: this changes no behavior. `check-diff` selects no source lint, typecheck, or related test job for a Markdown-only change.
- Compare the new counts with the exact `git rev-list` and `git diff --shortstat` output at the pushed head.
- Diff the revised body against the original and confirm the only differences are the counts sentence, the two paging passages, and the one repointed link.
- Confirm `8a099153` resolves to `product/specs/connections-tab.md` and shows the resize sentence.
- Run `git diff --check`; re-read the body from GitHub after editing and confirm the PR remains `OPEN` at the pushed head.

## Out of scope

- Editing production code, tests, specs, help, user documentation, or existing plans.
- Changing the PR title, the ACP-records spec link, the subplan pins, the manual acceptance table, the M7 blocked row, or any other body paragraph.
- Rerunning or re-claiming the full automated suite or the browser acceptance run.
- Working any other backlog entry, merging or closing the pull request, rewriting published history, or adding AI attribution.

## Completion

- Removed only the resolved backlog entry, restoring the drained file to its comment-and-heading skeleton, and promoted this plan.
- Measured the commit and changed-file counts at the pushed bookkeeping head and replaced the "As of this head" counts.
- Added the viewport-resize trigger to the record-tab paragraph and the "Record history and paging" step, keeping the top-scroll check for records with enough blocks.
- Repointed the connections-tab spec link at `8a099153`, leaving the ACP-records spec, the subplan pins, the manual acceptance table, the M7 blocked row, the PR title, and every other body paragraph unchanged.
- Left PR #1916 open at the pushed head with no AI attribution.
