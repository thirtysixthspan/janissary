# Coalesce a commit with an in-flight pull, and vice versa

**Complexity: 2/10** — two one-line guard additions in two existing modules, no new state, no new
architecture.

`runPull` in `src/file-navigator/manager-pull.ts` only guards on `state.pull === 'pulling'`, and
`runCommit` in `src/file-navigator/manager-commit.ts` only guards on `state.commit === 'committing'`.
Neither checks the other's in-flight flag, so a long-running pull and a commit — or the reverse — can
run at once in the same tab. Both act on git's index and `HEAD` lockfiles at the tree's root, so the
one that loses the race fails with a lockfile error the user reads as lost work: the commit case is
worse, because the message they composed appears to vanish even though the underlying `git commit`
either never ran or ran and only its follow-up `pull --rebase`/`push` failed.

## Approach

Extend each action's existing entry guard to also bail out when the *other* action is in flight,
returning early and posting nothing — exactly how each already coalesces against a second click on
itself. No new state field, no new notification: the two actions already share the same "in flight,
so silently do nothing" contract for their own repeat clicks, and the fix is only widening what counts
as "in flight" for each one's guard.

- `runPull`'s guard becomes `if (!state || state.pull === 'pulling' || state.commit === 'committing') return;`
- `runCommit`'s guard becomes `if (!state || state.commit === 'committing' || state.pull === 'pulling') return;`

The message field's own empty-or-whitespace cancel stays entirely client-side and untouched: a
coalesced confirmation from the row menu or the header button still closes the field with no RPC sent,
the same as it does today when nothing is wrong — the guard added here only prevents the RPC a
non-empty message would otherwise fire.

## Implementation steps

1. `src/file-navigator/manager-pull.ts` — widen `runPull`'s entry guard to also bail when
   `state.commit === 'committing'`; update the function's doc comment, which currently only mentions
   coalescing a second pull against itself.
2. `src/file-navigator/manager-commit.ts` — widen `runCommit`'s entry guard to also bail when
   `state.pull === 'pulling'`; update its doc comment the same way.

## Tests

In `src/file-navigator/manager.test.ts`, beside the existing `'ignores a second pull while one is
still in flight'` case (in the `describe('git pull', ...)` block) and `'ignores a second commit while
one is still in flight, and reports nothing for it'` case (in the `describe('git commit', ...)`
block), add:

- A `describe('git commit', ...)` case: start a pull with `Promise.withResolvers`, leave it
  unresolved, call `manager.commit(...)`, and assert `commitRootMock` was never called and `outputs`
  stays empty — mirroring the existing in-flight-commit case's shape.
- A `describe('git pull', ...)` case: start a commit the same way, leave it unresolved, call
  `manager.pull(...)`, and assert `pullRootMock` was never called and `outputs` stays empty.

`src/git/commit.test.ts` and `src/git/pull.test.ts` are untouched: neither module's own argument
handling changes.

## Out of scope

- **`src/file-navigator/manager-flash.ts` / sharing the flash state machine between pull and
  commit.** A separate, later item in the same backlog; this fix only widens the two existing entry
  guards and does not touch the settle/rest machinery.
- **A visible "busy" indicator or error message for the coalesced action.** Matches the existing
  self-coalescing behavior exactly: silent, not a hang reported to the user.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: not performed — this is a timing-dependent concurrency guard exercised through the existing
fake-timer/deferred-promise test harness, which is the verification available here.
