# Resync the connections pull request branch counts

**Complexity: 1/10** — a single-sentence description correction plus plan-and-backlog bookkeeping; no production, test, spec, help, or user-documentation change.

## Goal

Resolve PR #1916's recorded finding: "Correct the pull request description's stale commit and changed-file counts so its verification statement matches the branch head." The Summary says the branch carries 58 commits and 263 changed files from `139aaf43`, while the publication head carries more of both. Replace only that one sentence with the counts derived at the final pushed head, leaving every other byte of the body untouched.

## Approach and evidence

The only authority is the checked-out branch, not a cached number. At the publication head, take the commit count from `git rev-list --count 139aaf43..HEAD` and the changed-file count from `git diff --shortstat 139aaf43...HEAD`. Both must be measured after the bookkeeping commit is pushed, because that commit itself advances the commit count and may add a changed file.

The correction is scoped to the Summary sentence that begins "As of this head the branch carries" and ends after "`139aaf43`." The following sentence in the same paragraph, which lists what the branch includes, and every other paragraph — including the Verification, Manual acceptance status, Screenshots, and How to verify sections — stay byte-for-byte unchanged. The body makes no claim that the full suite was rerun, and this change does not add one.

## Implementation steps

1. Write this plan to `./product/plans/draft/`, then move it to `./product/plans/ready/`.
2. Remove only the resolved entry from `./product/backlog/pull-request.md`, preserving the remaining entry byte-for-byte.
3. Move the plan to `./product/plans/complete/`.
4. Run `$janissary/scripts/run.mjs check-diff` (no source checks are expected for a Markdown-and-backlog-only diff) and `git diff --check`.
5. Commit the plan and backlog bookkeeping with `$janissary/scripts/run.mjs pr-commit`, then push through the branch upstream.
6. At the pushed head, run `git rev-list --count 139aaf43..HEAD` and `git diff --shortstat 139aaf43...HEAD`.
7. Save the current body with `gh pr view 1916 --json body`, replace only the target sentence with those counts, write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit --body-file`.
8. Re-read the body from GitHub, confirm the PR is still open, and confirm `headRefOid` equals `git rev-parse HEAD`.

## Tests and verification

- No code tests: this changes no behavior. `check-diff` selects no source lint, typecheck, or related test job for a Markdown-only change.
- Compare the new counts with the exact `git rev-list` and `git diff --shortstat` output at the pushed head.
- Diff the revised body against the original and confirm the only difference is the counts sentence.
- Run `git diff --check`; re-read the body from GitHub after editing and confirm the PR remains `OPEN`.

## Out of scope

- Editing production code, tests, specs, help, user documentation, or existing plans.
- Changing the PR title or any body paragraph outside the counts sentence.
- Rerunning or re-claiming the full automated suite.
- Working any other backlog entry, merging or closing the pull request, rewriting published history, or adding AI attribution.

## Completion

- Measured the branch at the final pushed head and replaced only the Summary's commit-and-file sentence with those counts.
- Left every other body paragraph byte-for-byte unchanged and made no full-suite claim.
- Removed only the resolved entry from `product/backlog/pull-request.md`.
- `check-diff` selected no source checks and `git diff --check` passed.
- Pushed the bookkeeping commit, applied the description with `gh pr edit --body-file`, kept PR #1916 open, and added no AI attribution.
