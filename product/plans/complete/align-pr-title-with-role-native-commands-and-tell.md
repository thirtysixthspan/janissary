# Align the PR title with the role-native commands feature

**Complexity: 1/10** — changes one pull request title and records the correction.

## Goal

Name the open pull request for the completed role-native command grants and `tell` feature rather than its initial plan-decomposition commit.

## Approach

- Set PR #1943's title to `feat(acp): add role-native commands and tell`, which follows Conventional Commits and describes the original `role-native-commands-and-tell.md` feature.
- Do not change the PR body, source, tests, specs, or help. The completed canonical plan and existing PR body already describe the feature.
- Apply the title edit only after the fix plan and backlog update are pushed, then verify the title and that the PR remains open on the recorded branch.

## Tests

- No source behavior changes, so no code test applies. Verify the published title with `gh pr view` and confirm the PR body is unchanged.

## Out of scope

- Changing implementation, documentation, the pull request body, or published commit history.
- Merging or closing the pull request.
