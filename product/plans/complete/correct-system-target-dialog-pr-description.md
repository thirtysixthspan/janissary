# Correct the system-target dialog delivery description

**Complexity: 2/10** — this is a narrow PR description correction, plus a completed plan and removal of its backlog entry. It changes no repository behavior.

## Goal

Correct PR #1729's claim that the system-target creation dialog remains future work. Commit `db2dc0a5` delivers the project target, runscript picker, and submission flow. The aggregate schedules UI is also delivered in commit `555d79a1`; browser end-to-end verification remains planned.

## Approach

Update only PR-description status passages that say the system-target dialog or aggregate schedules UI remain planned, and correct the directly associated acceptance-scenario introduction that says no feature functionality has shipped. State the delivered dialog and aggregate UI scope, and retain browser E2E verification as planned. Preserve the PR title and unrelated body text exactly.

Publish the repository-side plan and selected backlog-entry removal first. Then reread the live PR body, replace only the affected status passages, and apply the full body with `gh pr edit --body-file`.

## Implementation steps

1. Confirm PR #1729 is open on `feature/system-schedules`, verify the dialog and aggregate UI implementation/specification, and prepare the branch and dependencies as required by the work-item task.
2. Publish this plan and remove only the selected backlog entry, preserving the second entry byte-for-byte.
3. After the push, update the affected PR-description status passages to identify the delivered system-target dialog, runscript picker, submission flow, and aggregate schedules UI. Leave browser E2E verification pending and preserve the title and unrelated text.
4. Verify the PR remains open, the title and unrelated body text are unchanged, and its head matches the published branch.

## Tests

No behavior or source code changes, so no new tests are applicable. Run `./scripts/run.mjs check-diff` after each repository change and verify the revised description against commits `db2dc0a5` and `555d79a1` plus `product/specs/scheduling.md`.

## Out of scope

- Source code, tests, specs, user documentation, or plans other than this fix plan.
- Any PR title change or edits to unrelated description text.
- Claiming browser E2E verification is complete.
- Any other PR backlog item.

## Verification

Run `./scripts/run.mjs check-diff` after each repository change. Before publication, inspect the staged change to ensure it contains only this plan and the selected backlog-entry removal. After publication, compare the revised body with the captured original and confirm only the affected status passages changed. Verify PR #1729 is open on `feature/system-schedules` and its remote head equals local `HEAD`.
