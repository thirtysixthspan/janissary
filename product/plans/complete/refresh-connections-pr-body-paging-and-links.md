# Refresh the connections pull request body's counts, paging text, and pinned links

**Complexity: 2/10** — a description-only correction spanning one counts sentence, two history-paging passages, and three pinned links, plus the required plan-and-backlog bookkeeping; no production, test, spec, help, or user-documentation change.

## Goal

Resolve PR #1916's recorded finding: "Description fidelity: refresh the pull request body's head counts, paging text, and pinned spec and ledger links after the later fixes."

The body still reports 78 commits and 278 changed files from `139aaf43`, while the branch head carries more of both. Its record-tab paragraph and "Record history and paging" step describe only top-scroll paging, not the delivered automatic loading while the loaded history fits the viewport. Its `37324fd4` links for `product/specs/connections-tab.md` and the 07 plan open versions that predate the corrected Terminate, paging, and ledger wording; the source plan also changed after that pin. Replace those passages and links, leaving the manual acceptance table, the M7 blocked row, and every other paragraph byte-for-byte unchanged.

## Approach and evidence

- `product/specs/connections-tab.md` at `73bbc4c6` describes the delivered paging: the tab opens on the newest window, loads older blocks when the reader reaches the top, and loads them automatically while the loaded history fits the viewport until the history scrolls or no older blocks remain. It also describes the record tab's Terminate as disabled from the click until the terminal status is reported and then removed, with the monitor's own control visible and disabled through cleanup.
- `product/plans/complete/connections-tabs-07-specs-docs-integration.md` at `4bb6e951` records the durable evidence scope: every commit after a row's last recorded SHA is outside that row's evidence, and `git log --oneline 5fa9845..HEAD` is the authoritative later-commit list.
- `product/plans/complete/connections-tabs.md` at `eda4bc41` carries the corrected record-tab Terminate presentation.
- The other linked specs and subplans are unchanged since `37324fd4`, so their pins stay as they are.
- The only authority for the counts is the checked-out branch at its final pushed head. Take the commit count from `git rev-list --count 139aaf43..HEAD` and the changed-file count from `git diff --shortstat 139aaf43...HEAD` after the bookkeeping commit is pushed, because that commit advances both.

## Implementation steps

1. Write this plan to `./product/plans/draft/`, then move it to `./product/plans/ready/`.
2. Remove only the resolved entry from `./product/backlog/pull-request.md`, preserving the remaining entry byte-for-byte.
3. Move the plan to `./product/plans/complete/`.
4. Run `$janissary/scripts/run.mjs check-diff` (no source checks are expected for a Markdown-and-backlog-only diff) and `git diff --check`.
5. Commit the plan and backlog bookkeeping with `$janissary/scripts/run.mjs pr-commit`, then push through the branch upstream.
6. At the pushed head, run `git rev-list --count 139aaf43..HEAD` and `git diff --shortstat 139aaf43...HEAD`.
7. Read the current body with `gh pr view 1916 --json body`, then make only these changes in `./temp/pr-body.md`: replace the counts in the "As of this head" sentence; add automatic older-history loading while the loaded history fits to the record-tab paragraph and the "Record history and paging" step, noting that a record with enough blocks still needs the top-scroll check; repoint the connections-tab spec link to `73bbc4c6`, the 07 plan link to `4bb6e951`, and the source plan link to `eda4bc41`, leaving the other link pins and every other paragraph unchanged.
8. Apply the body with `gh pr edit 1916 --body-file ./temp/pr-body.md`, re-read it from GitHub, and confirm the PR remains `OPEN` with `headRefOid` equal to `git rev-parse HEAD`.

## Tests and verification

- No code tests: this changes no behavior. `check-diff` selects no source lint, typecheck, or related test job for a Markdown-only change.
- Compare the new counts with the exact `git rev-list` and `git diff --shortstat` output at the pushed head.
- Diff the revised body against the original and confirm the only differences are the counts sentence, the two paging passages, and the three repointed links.
- Confirm each new pin resolves to the intended file at the named commit and shows the corrected Terminate, paging, or ledger content.
- Run `git diff --check`; re-read the body from GitHub after editing and confirm the PR remains `OPEN` at the pushed head.

## Out of scope

- Editing production code, tests, specs, help, user documentation, or existing plans.
- Changing the PR title, the manual acceptance table, the M7 blocked row, or any other body paragraph.
- Rerunning or re-claiming the full automated suite or the browser acceptance run.
- Working any other backlog entry, merging or closing the pull request, rewriting published history, or adding AI attribution.

## Completion

- Replaced the counts sentence with the commit and changed-file counts measured at the final pushed head.
- Added automatic older-history loading while the loaded history fits the viewport to the record-tab paragraph and the "Record history and paging" step, keeping the top-scroll check for records with enough blocks.
- Repointed the connections-tab spec, 07 plan, and source plan links at their relevant fix commits, leaving the unchanged link pins in place.
- Kept the manual acceptance table, the M7 blocked row, the PR title, and every other body paragraph byte-for-byte unchanged.
- Removed only the resolved backlog entry, promoted this plan, and left PR #1916 open at the pushed head with no AI attribution.
