# Commit to origin publishes the current branch

**Complexity: 5/10** — one function in `src/git/commit.ts` gains two small git probes and a branch on its push step; the cost is that it reverses a design decision `commit-file-to-origin.md` made deliberately ("a branch with no configured upstream is not published as a side effect"), so every test and spec sentence that pins that old behavior has to move with it.

Backlog text: *"a commit made to origin should go on the current branch, not always to the master branch. If the current branch does not exist on origin, it should be created on origin."*

`commitRoot` (`src/git/commit.ts:37`) already pushes bare — `['push']`, no remote and no branch named — so it does not literally hardcode `master`; a branch with no configured upstream instead makes the bare `git pull --rebase` that runs first fail with git's own "no upstream branch" text, and nothing is published. That is read from the outside as "it doesn't go to my branch", and the fix the backlog text asks for is the same either way: commit to origin should publish whatever branch the tree is actually on, creating it on `origin` the first time rather than failing.

## Design decisions

**Detect the missing-upstream case before touching the network, not by parsing git's failure text.** `git rev-parse --abbrev-ref --symbolic-full-name @{u}` exits non-zero exactly when the current branch has no upstream and prints its name otherwise; this is the standard probe and it means the commit-and-push cycle never has to pattern-match git's own error message to decide what to do next.

**A branch with an upstream keeps exactly its current behavior.** `pullRebase` then a bare `push` — unchanged. Nothing about the rebase-then-push path for an already-published branch is touched by this fix.

**A branch with no upstream skips the rebase and pushes with `--set-upstream origin <branch>`.** There is nothing on `origin` for this branch yet, so there is nothing to rebase against; running `git pull --rebase` first would only reproduce the exact failure this fix removes. `<branch>` comes from `git rev-parse --abbrev-ref HEAD`, read fresh rather than assumed, so the push always names the branch the tree is actually on — never `master`, never a name inferred from anywhere else.

**No new failure mode is introduced.** If the publishing push itself fails (network, permissions, a protected-branch rule on `origin`), it rejects with git's own error exactly as the bare push already does, and the caller's existing error handling in `manager-commit.ts` needs no change.

## Proposed changes

**`src/git/commit.ts`.** Add two small helpers beside `pullRebase`: `hasUpstream(root)` runs `git rev-parse --abbrev-ref --symbolic-full-name @{u}` and resolves `true`/`false` from whether it throws; `currentBranch(root)` runs `git rev-parse --abbrev-ref HEAD` and resolves the trimmed stdout. In `commitRoot`, after the `git commit` step succeeds, branch on `hasUpstream(root)`: when it resolves `true`, run `pullRebase(root)` then the existing bare `execFileAsync('git', ['push'], { cwd: root })` unchanged; when it resolves `false`, skip the rebase entirely and run `execFileAsync('git', ['push', '--set-upstream', 'origin', await currentBranch(root)], { cwd: root })` instead. Update the doc comments at `:13`–`:23` and `:99`–`:104`, which currently state the old "nothing is auto-configured" decision, to describe the new behavior.

**`product/specs/file-navigator-tab.md`.** The "Committing to origin" section's paragraph at `:742`–`:746` currently reads "A branch with no configured upstream is not published as a side effect: the attempt fails with git's own message... and nothing is configured on the user's behalf." Rewrite it to say the push goes to the current branch's own name on `origin`, and that when that branch does not yet exist there, the push creates it instead of failing, with no rebase run first since there is nothing yet to rebase against.

## Tests

- **`src/git/commit.test.ts`**: extend the `execFile` mock to answer `rev-parse --abbrev-ref --symbolic-full-name @{u}` and `rev-parse --abbrev-ref HEAD` from two new module-level controls (`upstreamExists`, defaulting `true`; `branchName`, defaulting to a fixed test branch name), independent of the existing `failing` set so a rejection can still be forced on the push step itself. Update the existing "stages, checks, commits, rebases, and pushes in that order" and "names no remote and no branch on either the rebase or the push" cases for the new call at the upstream-check step. Replace "never attempts to set an upstream when the rebase fails for want of one" — that scenario can no longer occur, since the upstream check now runs before any rebase is attempted — with two new cases: creating the branch on `origin` runs no rebase and pushes `['push', '--set-upstream', 'origin', <branch>]` when `hasUpstream` resolves false, using the fresh `branchName` value rather than a hardcoded name; and a publishing push that fails still rejects with git's own error, the same way the existing "rejects with the git error when the push fails" case does for the already-published path.

## Out of scope

- **Any remote other than `origin`.** The backlog text says "on origin"; choosing or configuring a different remote is untouched.
- **Detached `HEAD`.** `git rev-parse --abbrev-ref HEAD` prints the literal string `HEAD` in that state; the commit button is not reachable from a detached checkout today and this fix does not add handling for it.
- **Changing what `GitSync`'s hardcoded `origin master` push does** (`src/git/sync.ts:117`) — that is a separate, unrelated feature (editor-tab file syncing against a provisioned workspace whose branch is known to be `master`), not the file navigator's commit-to-origin path this fix touches.

## Verification

```
$janissary/scripts/run.mjs check-diff
```

Manual check: from the file navigator, on a branch with an existing upstream, commit a change and confirm it still rebases and pushes exactly as before. Then create a new branch with no upstream (`git switch -c throwaway`), change a file, and commit from the navigator; confirm it succeeds, `git branch -vv` shows the branch now tracking `origin/throwaway`, and `git log origin/throwaway` shows the commit.
