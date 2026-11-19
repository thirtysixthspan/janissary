# Correct PR 2099 title to describe the delivered model search feature

**Complexity: 1/10** — metadata-only title correction: 0 production lines/files edited, 1 requirement, no test scenarios or new units (p=2.07)

## Goal

PR 2099's title claims the change is only a plan-decomposition docs edit (`docs(plans): decompose model search input plan into ordered subplans`), but its diff delivers the shared model search input in the roles Add model picker and the New harness dialog. The title must name the feature it ships so a squash merge records a feature subject and release notes and future history searches classify it correctly. The PR body already describes the final code accurately and must not change.

## Approach

Replace the PR title with a Conventional Commits subject that names the delivered feature, using a valid type (`feat`) per `ai/guidelines/conventional-commits.md`: `feat(roles,harness): add shared model search input`. This is the exact correction named by the recorded backlog entry and authorized for this work item. The change is metadata-only on GitHub: no source, test, spec, documentation, or other plan file is altered, and no commit subject or repository history is rewritten.

Apply the title edit only after the supporting plan and backlog cleanup are committed and pushed, so the branch always carries its artifacts before the live GitHub title changes. Leave the PR open throughout.

## Implementation steps

1. Write and promote this fix plan to `./product/plans/complete/`.
2. Remove the resolved entry from `./product/backlog/pull-request.md`, restoring the exact master comment-and-heading skeleton because it is the only entry.
3. Commit and push the plan plus backlog change to `feature/roles-model-search-input` with a Conventional Commits subject; do not amend or rewrite the PR's existing first commit.
4. Apply the title correction with `gh pr edit <url> --title "feat(roles,harness): add shared model search input"`. Leave the PR body untouched.
5. Verify the PR remains OPEN, its `headRefOid` matches the pushed HEAD, the backlog is back to the master skeleton, and `gh pr view <url> --json title,body` shows the corrected title and an unchanged body.

## Tests

No new tests. This change edits only GitHub PR metadata (the title) plus the repository's own plan and backlog files; no source behavior changes, so there is nothing to test and no `check-diff` run is required. The feature's existing tests on the branch are unaffected.

## Spec and docs

None needed. No user-visible behavior changes; the PR body already matches the code and is left unchanged.

## Out of scope

- Editing the PR body, which already matches the code.
- Any source, test, spec, documentation, or other plan file.
- Changing the first commit subject or rewriting, squashing, or force-pushing history.
- Merging or closing the PR.
