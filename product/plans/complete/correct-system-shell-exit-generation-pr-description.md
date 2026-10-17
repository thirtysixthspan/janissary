# Correct the system shell exit-generation description

**Complexity: 2/10** — the repair updates the PR description after publication, plus a completed plan and removal of its backlog entry. It changes no repository behavior.

## Goal

Correct PR #1729's statement that the current diff contains plans only. Commit `ed223846` implements the client-reported shell exit generation contract in `system-schedules-05-system-shell-exit-generation-client-contract.md`.

## Approach

Update only the description's plans-only publication claim, clearly identifying `ed223846` as the implementation of the named plan. Summarize that terminal close and mount-time status reports are bound to a captured PTY generation, and that verified generation-bound exits follow the appropriate close or managed-shell recovery behavior. Distinguish this implementation from the broader plans-only publication description without implying unrelated system-schedule behavior has shipped. Preserve the plan link and all acceptance claims precisely.

The repository-side delivery is this plan and removal of the selected entry from `product/backlog/pull-request.md`. Publish those changes first. Then read the live PR body, make the narrowly scoped correction, and apply the full body through `gh pr edit --body-file` without changing the title or any other paragraph.

## Implementation steps

1. Confirm the recorded PR is open on `feature/system-schedules` and the branch is current; audit dependencies and prepare the workspace as required by the work-item task.
2. Verify the selected entry against commit `ed223846` and the completed plan `system-schedules-05-system-shell-exit-generation-client-contract.md`.
3. Publish this plan and remove only the selected first backlog entry, preserving both remaining entries byte-for-byte.
4. After the push, update the PR body to identify the implementation commit and plan, accurately summarize the generation-bound behavior, and retain every unrelated paragraph exactly.
5. Verify the PR remains open, its title is unchanged, the body retains all unrelated text, and its head matches the published branch.

## Tests

No behavior or source code changes, so no new tests are applicable. Run `./scripts/run.mjs check-diff` for each repository change and verify the description edit directly against the recorded plan and commit.

## Out of scope

- Any source, test, spec, documentation, or implementation-plan changes other than this fix plan.
- Any PR title change or edits to unrelated description paragraphs.
- Resolving either of the other two PR backlog entries.
- Any claim that unrelated system-schedule implementation is delivered by `ed223846`.

## Verification

Run `./scripts/run.mjs check-diff` after each repository change. Before publication, inspect the staged change to ensure it contains only this plan and the selected backlog-entry removal. After publication, compare the revised body with the captured original and verify only the intended claims changed. Confirm PR #1729 is open on `feature/system-schedules`, the title is unchanged, the remote head equals local `HEAD`, and exactly two backlog entries remain with their original text.
