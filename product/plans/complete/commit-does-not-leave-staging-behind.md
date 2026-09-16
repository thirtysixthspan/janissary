# Do not leave a failed commit's staging behind

**Complexity: 5/10** — one pre-check and one conditional unwind inside an existing function, a small
module-level marker (a `WeakSet`, not a new exported type crossing module boundaries), a second report
string, and one call site choosing between the two report strings. No new architecture; the largest
piece of work is reworking `src/git/commit.test.ts`'s recording mock so its two `git diff` probes can
answer independently, since the existing mock only varied failure by subcommand name.

`commitRoot` stages with `git add -A` as its very first step and never unwinds it. A `git commit` that
rejects — a refusing pre-commit hook, an unconfigured `user.email`, a message git won't take — leaves
every change the header button or row menu named sitting staged in the user's own repository, with
`Could not commit: <git error>` the only thing reported; nothing says the index was rewritten on the
user's behalf. The next commit made from a terminal silently carries that staging along, which is how
an unrelated scratch file or half-finished edit reaches `origin` inside someone else's commit.

## Approach

**Only the pre-commit-object window is unwound.** Once `git commit` itself has succeeded, a real
commit object exists locally; `pull --rebase` or `push` failing after that point leaves a real,
inspectable commit behind and today's behavior — report the error, touch nothing — is already right.
Only a rejection from the `git commit` step itself is a candidate for unwinding, because it is the only
point where "stage, then fail" can leave staging that was never asked for.

**Whether to unwind depends on what was staged before this action ran.** `commitRoot` already has
`hasStagedChanges(root)` (`git diff --cached --quiet`) to answer the nothing-to-commit case after
staging; running it once more *before* `stage` answers whether the index already held changes of the
user's own. If `git commit` then rejects:
- **Index was clean beforehand** — everything currently staged is this action's own doing. Run a bare
  `git reset` (mixed, no pathspec, `cwd` at the tree root) to put the index back, swallowing a failing
  reset the same way `pullRebase` already swallows a failing `git rebase --abort`, and re-throw git's
  original commit error unchanged.
- **Index was already dirty beforehand** — some of what's staged is the user's own prior work that
  this action must not destroy by resetting blindly. Nothing is unwound; the error is flagged instead,
  so the caller can tell the user the staging was left in place rather than silently matching the
  clean-index case's "nothing to see here" tone.

**How the flag reaches the caller.** `commitRoot` runs in-process for a local navigator and, on the far
side of a remote session, inside the same `LocalFileSystemPort.commit` the remote server-side dispatch
already calls — so the fix protects a remote host's own index exactly as it protects a local one, with
no protocol change needed. The distinction only needs to survive to whichever caller is in the same
process as the throw, which for a *local* navigator is `manager-commit.ts`'s catch handler directly. A
module-level `WeakSet<object>` in `commit.ts`, checked by an exported `commitLeftStagingInPlace`
predicate, marks the exact `Error` instance rather than adding a property to it or introducing a new
exported error class — it needs no import into `commit-report.ts`, and nothing about the `Error`
object itself changes, so `commitFailureText`'s existing `instanceof Error` handling stays exactly as
written for whichever caller doesn't check the predicate.

**A remote commit's failure text won't carry the distinction.** The wire protocol already turns every
operation's rejection into a plain string (`filesystem-reply`'s `error` field) before it reaches the
client, and `git-commit` has no refusal shape to carry a second field even if one were added — so a
remote commit that leaves its own staging in place still reads as an ordinary `Could not commit: <git
error>` to the user. The far side's own index is still protected; only the client-side wording doesn't
distinguish it there. This mirrors every other refusal `git-commit` cannot classify.

## Implementation steps

1. `src/git/commit.ts` — in `commitRoot`, call `hasStagedChanges(root)` once before `stage` and keep
   the result; if `git commit` rejects, either reset (clean-beforehand case, via a small `unstage`
   helper mirroring `pullRebase`'s abort-and-swallow shape) or mark the thrown error in a new
   module-level `WeakSet` (dirty-beforehand case); re-throw the original error unchanged either way.
   Export `commitLeftStagingInPlace(error: unknown): boolean` reading that set. Update the function's
   doc comment.
2. `src/file-navigator/commit-report.ts` — add `commitFailureLeavesStagedText(error: unknown): string`
   beside `commitFailureText`, naming that the staged changes are still in the index.
3. `src/file-navigator/manager-commit.ts` — import `commitLeftStagingInPlace` and
   `commitFailureLeavesStagedText`; in `runCommit`'s failure branch, choose between the two report
   strings based on the predicate.
4. `product/specs/file-navigator-tab.md` — "Committing to origin": add a sentence on what a failed
   commit leaves behind, and that it is reported when the index already held the user's own staging.
5. `documentation/user-documentation/tab-types/file-navigator.md` — "Committing your changes to
   origin": the matching sentence.

## Tests

**`src/git/commit.test.ts` mock rework.** The recording `execFile` mock currently drives every failure
by a `failing: Set<string>` keyed on subcommand name, with `diff` permanently in the default set to
simulate "there is something to commit" after staging. With a second `diff` call now running before
`stage`, the two calls need independent answers — one mock entry can no longer mean one outcome for
both. Replace the single `diff`-in-`failing` convention with an ordered `diffDirty: boolean[]` (default
`[false, true]`: clean before, staged after, the ordinary case), consumed one entry per `diff` call in
sequence and holding its last entry for any call beyond the array's length; `diff` stops being read
from `failing` at all. Existing test bodies that set `failing = new Set(['diff', ...])` drop the
`'diff'` entry, since the default `diffDirty` already gives them the same "staged after" outcome they
relied on; the nothing-to-commit case sets `diffDirty = [false, false]` instead of an empty `failing`
set answering `diff` as clean throughout. Every subcommand-index assertion (`calls[0]`, `calls[2]`,
`calls[3]`, `calls[4]`) shifts by one now that a `diff --cached --quiet` probe runs before `add`, and
the `'stages, checks, commits, rebases, and pushes in that order'` case's full expected sequence gains
the leading probe.

New cases:
- The commit step fails over an index that was clean beforehand: a trailing `reset` runs, the
  original error is rejected unchanged, and `commitLeftStagingInPlace` on the caught error is `false`.
- The commit step fails over an index that was already dirty beforehand (`diffDirty = [true, true]`):
  no `reset` runs, and `commitLeftStagingInPlace` on the caught error is `true`.
- The existing `'aborts a failed rebase and still rejects with git's own error'` case gains an
  assertion that no `reset` ran — the commit object already exists by the time the rebase fails, so
  there is nothing to unwind.

The existing `'aborts a failed rebase...'` and `'does not mask the rebase error when the abort itself
fails'` cases keep passing with only their `failing` sets losing the now-inert `'diff'` entry.

**`src/file-navigator/commit-report.test.ts`**: a `commitFailureLeavesStagedText` case carrying an
`Error`'s message and naming that staging was left in place, mirroring `commitFailureText`'s existing
cases.

**`src/file-navigator/manager.test.ts`**: not changed — `commitRootMock` there is a plain resolved/
rejected-value mock with no staging semantics of its own, so choosing between the two report strings
is `commit-report.ts`/`manager-commit.ts` unit-level behavior, already covered by the two files above.

## Out of scope

- **A remote commit's notification distinguishing the two failure texts.** As above: the wire protocol
  already collapses every rejection to a string, and `git-commit` has no refusal shape to extend for
  this one case. The far side's own index still gets the same protection; only the client's wording
  does not.
- **Unwinding anything after the commit object exists.** `pull --rebase` and `push` failing after a
  real commit lands stay exactly as they are — there is a real, inspectable commit by then, and
  "leave it and report the error" is already correct.
- **`src/git/pull.ts` and `pullRebase`'s own abort-and-swallow shape.** Referenced as the precedent this
  fix follows, not touched itself.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: not performed — this is a git-subprocess code path exercised through a recording `execFile`
mock, which is the verification available here.
