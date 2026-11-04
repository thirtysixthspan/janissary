# Resync the connections pull request manual acceptance status

**Complexity: 2/10** — a description correction plus plan-and-backlog bookkeeping; no production, test, spec, help, or user-documentation change.

## Goal

Resolve PR #1916's recorded finding: the body still reports the pre-evidence manual acceptance state. It says the completed 07 ledger is the latest manual evidence, that no later commit records browser or real-host acceptance, that M3, M4, and M5 were not exercised, and that no screenshots were captured, while the 07 ledger at the head now records the 2026-11-04 browser run from `37324fd4` and the new 08 plan records its evidence. The same snapshot counts 55 commits where the publication head carries more and keeps a 261-file count that no longer matches the merge-base comparison.

## Approach and evidence

The only authorities are `product/plans/complete/connections-tabs-07-specs-docs-integration.md` and `product/plans/complete/connections-tabs-08-manual-acceptance-verification.md` at the head. Read their scenario rows and evidence ledger, then correct only:

- the Summary sentence that states the commit and changed-file counts, using `git rev-list --count origin/master..HEAD` and `git diff --shortstat origin/master...HEAD` at the publication head;
- the Verification paragraph's claim that the 07 ledger remains the latest manual evidence and that no later browser or real-host acceptance exists;
- the Manual acceptance status table, giving M1 through M6 and M8 the ledger's actual per-scenario status and evidence, and keeping M7 blocked;
- the missing-resource list, removing the stale claim that no browser evidence exists and retaining the real limits;
- the Screenshots statement, replacing the false no-capture claim with the browser run's uncommitted scratch evidence and its limits.

Everything else in the body stays byte-for-byte unchanged, including the title, the `## What shipped` sections, `## How to verify`, and the source links. No code, test, spec, existing plan, or evidence file is edited.

## Implementation steps

1. Save the current body with `gh pr view 1916 --json body --jq .body` into `./temp/pr-body.md`.
2. Apply the scoped corrections above, using the publication head's commit and file counts and the 07/08 ledger wording for each scenario.
3. Promote this plan from `./product/plans/draft/` to `./product/plans/ready/`, then to `./product/plans/complete/` after verification.
4. Remove only the resolved entry from `./product/backlog/pull-request.md`, preserving the remaining entries byte-for-byte.
5. Run `$janissary/scripts/run.mjs check-diff` and `git diff --check`, commit the plan and backlog bookkeeping with `pr-commit`, and push through the branch upstream.
6. After the push, apply the revised body with `gh pr edit 1916 --body-file ./temp/pr-body.md`, then re-read it from GitHub and confirm the PR is still open.

## Tests and verification

- No code tests: this changes no behavior. A Markdown-and-backlog-only diff selects no source lint, typecheck, or related test job in `check-diff`.
- Compare every table row with the 07 ledger's per-scenario evidence and the 08 plan's scenario table.
- Compare the commit count with `git rev-list --count origin/master..HEAD` and the file count with `git diff --shortstat origin/master...HEAD` at the pushed bookkeeping head.
- Run `git diff --check`; then re-read the body from GitHub against both plans and `git log --oneline origin/master..HEAD`.
- Confirm the description makes no full-pass claim and keeps M7 blocked.

## Out of scope

- Editing production code, tests, specs, help, user documentation, existing plans, or evidence.
- Changing the PR title or any body paragraph outside the counts, Verification, manual acceptance, and Screenshots statements.
- Rerunning or re-claiming the full automated suite, substituting tests for browser or real-host checks, or inventing screenshots or results.
- Working any other backlog entry, merging or closing the pull request, rewriting published history, or adding AI attribution.

## Completion

- Updated the Summary counts to the publication head and the current merge-base shortstat.
- Replaced the stale latest-evidence and no-browser statements with the 2026-11-04 browser run recorded by the 07 ledger and 08 plan.
- Gave M1, M2, M3, M4, M5, M6, and M8 their actual ledger status and limits, and kept M7 blocked for the missing protocol-37 host and authenticated remote provider.
- Replaced the no-screenshot claim with the browser run's uncommitted scratch evidence, without committing anything under `temp/`.
- Removed only the resolved entry from `product/backlog/pull-request.md`.
- `$janissary/scripts/run.mjs check-diff` selected no source checks, and `git diff --check` passed.
- Pushed the bookkeeping commit, applied the description with `gh pr edit --body-file`, kept PR #1916 open, and added no AI attribution.
