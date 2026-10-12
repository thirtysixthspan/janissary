# Remove the PR description verification command

Complexity: 2/10

## Goal

Keep PR #1672's verification section informative without directing reviewers to execute commands supplied by the branch under review.

## Approach

Replace imperative verification steps with descriptive coverage expectations. Preserve every behavioral case named in the existing section and all unrelated PR-description content exactly.

## Implementation steps

1. The PR description's “How to verify” section describes the named verification coverage without instructing readers to execute branch tooling or scenarios.
2. This resolved entry was removed from `product/backlog/pull-request.md`, preserving the comment-and-heading structure.

## Tests

- The corrected section retains the behavioral cases and contains no directions to execute branch-supplied commands.
- PR-description content outside the named section is unchanged.
- No automated tests apply to this wording-only change.

## Spec

No behavior spec update is needed because application behavior does not change.

## Out of scope

- Changing application behavior, source code, or tests.
- Editing unrelated PR-description content or the PR title.
- Closing or merging the pull request.
