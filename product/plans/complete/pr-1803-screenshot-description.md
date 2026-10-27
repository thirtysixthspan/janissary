# Correct PR 1803's screenshot description

Complexity: 1/10

## Goal

Make PR #1803's Screenshots section accurately state that the pull request includes no screenshots, without changing any other part of its description.

## Approach

Replace only the existing follow-up promise in the Screenshots section with `No screenshots are included in this PR.` Keep the section heading and all other body text byte-for-byte unchanged. Remove the resolved, sole entry from the PR backlog and restore its required empty-file skeleton.

## Implementation steps

1. Update only the Screenshots section in PR #1803's description, preserving every other body byte.
2. Remove the selected entry from `product/backlog/pull-request.md`, retaining the leading comment and `# pull-request` heading.

## Tests

- Compare the revised PR description with the original body and confirm the only change is the Screenshots section sentence.
- Confirm the Screenshots section states that no screenshots are included and the PR remains open on `cli/file-tree-view`.
- Run `$janissary/scripts/run.mjs check-diff` for the plan and backlog changes. No source behavior changes, so no automated test cases apply.

## Out of scope

- Changing the PR title or any other description text.
- Adding screenshots or modifying source, specs, or public documentation.
- Merging or closing the pull request.
