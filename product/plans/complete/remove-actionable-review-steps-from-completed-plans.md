# Record completed-plan verification as history

**Complexity: 2/10** — historicalize five verification commands and one PR-description edit directive across four completed plans, inspect the other completed plans introduced by this PR, and remove one backlog entry.

## Goal

Keep completed plans from instructing future readers to run review-time commands or edit PR #1803's description, while preserving their implementation decisions and outcomes.

## Approach

Rewrite the five remaining `check-diff` directives in the four plans named by the backlog entry as past-tense verification records. In the hidden-path plan, record the already-completed PR-description correction after the push and the preservation of all other body text and the title. Inspect every completed plan introduced by this PR for remaining actionable review-time command or PR-edit directions, without changing plans outside the four named files.

## Implementation steps

1. The remaining verification directives in `bind-printed-selections-to-navigator-root.md`, `deliver-files-command-summary.md`, `clarify-hidden-path-restore-clauses.md`, and `file-navigator-trailing-in-label.md` were replaced with records of the checks that passed.
2. The hidden-path plan's post-push PR-description edit instruction was replaced with a record of the completed correction and preservation checks.
3. All completed plans introduced or renamed by PR #1803 were reviewed for actionable review-time commands and PR-description edits. The other plans' verification and PR-edit references already recorded outcomes or defined scope, so no other plan was changed.
4. The only entry was removed from `product/backlog/pull-request.md`, restoring its comment-and-heading skeleton.

## Tests and verification

No application tests applied because this change alters only completed plan history and the PR backlog. Diff-scoped checks completed successfully after each documentation change without selecting source lint, typecheck, or tests. Final diff review confirmed that only the four specified plans, this plan, and the selected backlog entry changed. PR #1803 remained open on `cli/file-tree-view`, and its description was unchanged.

## Specs and docs

No functional spec, help page, or user documentation describes these plan-history records, so none needs an update.

## Out of scope

- Changing application behavior, tests, functional specs, help, or user documentation.
- Editing any completed plan outside the four named in the backlog entry.
- Editing PR #1803's description or title, or changing any other backlog entry.
- Merging or closing the pull request.
