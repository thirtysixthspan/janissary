# Stash extra changes before the commit-to-origin rebase

Issue: when committing files to origin in the file navigator or the editor, if there are files
that are not part of the commit, they must be stashed before any `git pull --rebase` runs, and
applied back afterward.

Complexity rating: 5/10

## Goal

`commitRoot` (`src/git/commit.ts`) stages and commits only the paths the action names, then runs
`git pull --rebase` before pushing. Any other dirty or untracked file in the tree — one the user
never asked this action to touch — is left in the working tree exactly as it was, which risks
`git pull --rebase` failing (or, worse, silently interacting with the rebase) over content that has
nothing to do with the commit just made. The fix: stash whatever is left in the tree once the
commit lands and before the rebase runs, then restore it once the rebase settles, whether it
succeeds or fails.

## Approach

Add a stash/restore wrapper around the existing `pullRebase` call inside `commitRoot`, active only
on the branch that already has an upstream (the branch with no upstream skips the rebase entirely,
so there is nothing to protect it from).

1. After the commit lands, probe `git status --porcelain` at `root`. A non-empty result means the
   tree still holds changes outside this action's own commit.
2. If so, run `git stash push --include-untracked -m "commit-to-origin"` before `pullRebase`, and
   `git stash pop` after it — regardless of whether `pullRebase` succeeded or threw. A failure to
   pop while the rebase itself also failed must not mask the rebase's own error, mirroring the
   existing `rebase --abort` swallow pattern; a failure to pop after a *successful* rebase is a
   real problem (a conflict against the rebased tree) and must surface to the caller.
3. Skip the probe and the stash/pop pair entirely when the tree has nothing left outside the
   commit — the common case — so no extra git process runs for a clean tree.

## Implementation steps

1. In `src/git/commit.ts`, add `stashExtraChanges(root)` (runs `git status --porcelain`, returns
   whether anything came back), `popExtraChanges(root)` (runs `git stash pop`), and a
   `swallowPop(root)` helper for the failure branch, following the existing comment style and the
   `unstage`/`pullRebase` swallow pattern already in the file.
2. Wrap the `hasUpstream` branch's `pullRebase(root)` call with the new stash/pop logic: stash if
   `stashExtraChanges` reports extra changes, call `pullRebase`, and in a `try/catch` pop on
   success or swallow-and-pop on failure before rethrowing.
3. Update the file's header comment block to note the new stash behavior alongside the existing
   staging-unwind explanation.
4. Run `./scripts/run.mjs check-diff` after each step.

## Tests

Extend `src/git/commit.test.ts`, following its existing mock style (`calls`, `failing`,
`subcommands()`):

- Add a `statusPorcelain` mock variable (default `''`) so `git status --porcelain` in the mock
  returns it as stdout; extend the `failing` match so `git stash push`/`git stash pop` can fail
  independently of each other (matching on the full `args.join(' ')` for `stash`, `args[0]` for
  everything else).
- Update the existing exact-sequence assertions (the "stages, checks, commits..." test and others
  that assert the full `subcommands()` array) to include the new `status --porcelain` call in the
  upstream branch.
- New test: a clean tree beyond the commit's own paths runs no `stash` call at all.
- New test: extra uncommitted/untracked content is stashed before `pull --rebase` and popped back
  after, in that order.
- New test: a failed rebase still pops the stash back, and the rejection is still the rebase's own
  error, not the pop's.
- New test: a failed rebase whose stash pop also fails still rejects with the rebase's own error
  (the pop failure is swallowed, mirroring `rebase --abort`'s own swallow).
- New test: a successful rebase whose stash pop fails rejects with the pop's own error, since that
  failure is real and must reach the caller.

## Out of scope

- `src/git/sync.ts`'s separate `GitSync` pull-rebase cycle (a different feature, a different clone).
- Any change to what gets staged or committed — only the rebase step's handling of everything else
  in the tree.
- UI/notification changes — the existing `Could not commit: <git error>` line already covers a
  rejected `commitRoot` call, stash-related or not.

## Specs and docs

- `product/specs/file-navigator-tab.md`: the "What runs is..." paragraph describing stage, commit,
  rebase, push gets a note that any other change left in the tree is stashed before the rebase and
  restored after, whether the rebase lands or is abandoned.
- `product/specs/editor-tab.md`: unchanged — it already points at the file navigator's spec for the
  rebase mechanics rather than repeating them.
- `help.md`: checked; it does not document this mechanic, so no update expected.
