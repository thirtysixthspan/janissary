# Correct the aggregate schedules delivery description

**Complexity: 2/10** — this is a narrow PR description correction, plus a completed plan and removal of its backlog entry. It changes no repository behavior.

## Goal

Correct PR #1729's claim that aggregate schedules integration remains future work. Commit `555d79a1` delivers owner-aware aggregate rows, keyed system-schedule deletion, managed-shell focus, and cross-owner clear.

## Approach

Update only the PR body paragraph that describes aggregate integration as future work. State what commit `555d79a1` delivers and retain the dialog and browser E2E work as planned. Preserve every unrelated paragraph and the PR title exactly.

Publish the repository-side plan and selected backlog-entry removal first. Then reread the live PR body, replace only the named paragraph, and apply the full body with `gh pr edit --body-file`.

## Implementation steps

1. Confirm PR #1729 is open on `feature/system-schedules`, verify commit `555d79a1` and its aggregate schedules changes, and prepare the branch and dependencies as required by the work-item task.
2. Publish this plan and remove only the selected backlog entry, restoring the exact comment-and-heading skeleton because no entries remain.
3. After the push, update only the aggregate integration status paragraph to identify the delivered owner-aware rows, keyed system deletion, managed-shell focus, and cross-owner clear. Keep dialog and browser E2E work planned and preserve all other body text.
4. Verify the PR remains open, the title and unrelated body text are unchanged, and its head matches the published branch.

## Tests

No behavior or source code changes, so no new tests are applicable. Run `./scripts/run.mjs check-diff` after each repository change and verify the revised description directly against commit `555d79a1`.

## Out of scope

- Source code, tests, specs, user documentation, or plans other than this fix plan.
- Any PR title change or edits to unrelated description paragraphs.
- Claiming the dialog or browser E2E work is delivered.
- Any other PR backlog item.

## Verification

Run `./scripts/run.mjs check-diff` after each repository change. Before publication, inspect the staged change to ensure it contains only this plan and the selected backlog-entry removal. After publication, compare the revised body with the captured original and confirm only the aggregate delivery paragraph changed. Verify PR #1729 is open on `feature/system-schedules` and its remote head equals local `HEAD`.
