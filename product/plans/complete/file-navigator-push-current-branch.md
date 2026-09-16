# Push file-navigator commits to the current branch

**Complexity: 2/10**

## Goal

Allow a file navigator commit to publish when its local branch tracks an upstream with a different name, without ever sending the commit to that differently named branch.

## Approach

Keep the existing rebase against a configured upstream, then make the publishing push explicitly name `origin` and `HEAD`. Git resolves that refspec to the checked-out branch's name on the remote, avoiding the default-push rejection caused by an upstream-name mismatch. The first-publish path continues to set the upstream explicitly.

## Implementation steps

1. Update `src/git/commit.ts` so the configured-upstream publishing path pushes `HEAD` to `origin` rather than relying on Git's default push policy.
2. Update `src/git/commit.test.ts` to assert that configured-upstream commits publish the current branch even when the upstream has a different name.
3. Correct the file-navigator functional spec and user documentation to state that publishing always targets the current branch name on `origin`.

## Tests

- `src/git/commit.test.ts`: verify the configured-upstream path runs `git push origin HEAD` after rebasing.

## Out of scope

- Changing how the action selects its rebase source.
- Changing first-time branch publishing or authentication behavior.
