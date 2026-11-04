# Resync the connections pull request's commit count at the final head

Complexity: 2/10

## Goal

The Summary paragraph of pull request 1916 says the branch carries 62 commits from `139aaf43`, but a later test commit moved the head to 63 commits. A reviewer checking the branch statistics sees a mismatch and may distrust the surrounding verification statement.

## Approach

Record this bookkeeping fix as a completed plan and remove the resolved entry from the pull request backlog, then push that commit before touching the description. Read the commit and changed-file counts at the newly pushed head so the sentence names the true final head rather than the head that preceded this bookkeeping. Replace only the sentence beginning "As of this head the branch carries" and preserve every other paragraph byte-for-byte, including the verification and manual acceptance sections; no full suite is rerun.

## Implementation steps

1. Write this plan and promote it to `product/plans/complete/`.
2. Remove the resolved entry from `product/backlog/pull-request.md`, restoring the comment-and-heading skeleton because no entries remain.
3. Commit and push the bookkeeping so the published head includes it.
4. Run `git rev-list --count 139aaf43..HEAD` and `git diff --shortstat 139aaf43...HEAD` at the pushed head.
5. Replace only the Summary sentence beginning "As of this head the branch carries" with those counts.
6. Apply the body with `gh pr edit --body-file`, re-read it from GitHub, and confirm PR 1916 remains open with `headRefOid` equal to local `HEAD`.

## Tests

None. This changes no code; verification is the re-read body matching the derived counts and the open pull request's head SHA.

## Out of scope

- Application source, tests, specifications, help, and user documentation.
- The pull request title and every description paragraph outside the named sentence.
- Any claim that the full suite was rerun.
