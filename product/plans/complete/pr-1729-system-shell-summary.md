# PR 1729: correct the system-shell implementation summary

**Complexity: 2/10** — verify the existing plan and implementation, correct one PR-description paragraph, and remove the recorded backlog item.

## Goal

Make PR #1729's implementation summary accurately describe the current system-shell profile-isolation change without rewriting its broader plans history or unrelated description text.

## Approach

Use `system-schedules-06-system-shell-profile-isolation.md` as the source of truth. Update only the implementation summary to identify plan 06 and state that profile save omits the managed system shell, relaunch skips authored `system` entries before tab lookup or close, and subjectless shell placement excludes existing managed system and launch shells. Keep the wider plans publication and plan 05 history distinct from the current implementation summary.

The named source files already implement the proposal, and the profile spec and user documentation already describe the resulting behavior. No code, tests, spec, or user-documentation edits are needed.

## Implementation steps

1. Promote this plan to `product/plans/ready/` before making the description correction.
2. Remove only the selected entry from `product/backlog/pull-request.md`.
3. Publish the plan and backlog update to the existing PR head branch.
4. Read the current PR body and replace only its stale implementation-summary text, preserving the title and every other paragraph exactly.
5. Confirm the PR remains open and its head matches the pushed branch.

## Tests

No new tests. Verify the named implementation paths and existing profile spec/user guide, then run the required diff-scoped check for the documentation-only plan and backlog changes.

## Out of scope

- Changing implementation, tests, profile specs, or user documentation.
- Rewriting the broader plans publication or plan 05 history.
- Editing the PR title or any unrelated description paragraph.
- Merging or closing the PR.
