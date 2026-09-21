# Key the remote-sessions record file per account

**Complexity: 4/10** — the store's file location becomes per-account, load gains a directory scan, and the two decision comments (store justification, instance-lock cross-account cost) state the reconciliation. No manager, action, or naming change; the store module holds the whole change.

## Goal

Per the PR backlog entry: "Reconcile the store's single-writer premise with the same pull request's narrower instance-lock rule."

`src/sessions/store.ts` justifies one shared `remote-sessions.json` by `acquireLock` refusing a second janissary per directory — but `isOwnInstanceAlive` (`src/instance-lock.ts`) now treats a recorded pid this account cannot signal as stale, so two janissary instances under different accounts in one shared project directory are both admitted, and each rewrites the other's record file out from under it at every mirror.

## Approach

**Key the record file per user, discovered merged at load.** Each writer writes only its own `remote-sessions.<account-hash>.json`, so two admitted writers can no longer clobber each other. `loadRemoteSessions` reads every `remote-sessions*.json` file in the directory — including the legacy `remote-sessions.json`, so parked sessions survive this change without migration — and merges them by session id, keeping the newest activity when a duplicate appears. The shared-directory premise is then stated in both places that claim the guarantee: the store header, and `acquireLock`'s comment in `src/instance-lock.ts`.

Chosen over merge-on-write inside `saveRemoteSessions`: merging an on-disk file into every save would resurrect a session the running process just dropped — `saveRemoteSessions` has no notion of "dropped" to defend against, and the merge functions keep records by id, not by writer — and would still race at the read-then-write boundary itself. Chosen over per-user isolation without discovery: a record visible to its writer alone would make the shared-directory install show two disjoint lists, and the list is meant to be "everything this project's janissaries parked".

## Implementation steps

1. `src/sessions/store.ts`: `initRemoteSessionStore` derives the file name from an `sha256`-truncated hash of `userInfo().username` (falling back to the uid string when the platform yields nothing); keep the legacy file name on the merged read.
2. `loadRemoteSessions` collects every `remote-sessions*.json` in `.janissary/`, tolerating absent files, and dedupes by session id with the newer activity winning; pruning happens after the merge as before.
3. `saveRemoteSessions` is unchanged in shape — it writes only this process's own file.
4. Update the store's header comment and `acquireLock`'s comment in `src/instance-lock.ts` to record the reconciliation.

## Out of scope

- Any change to the lock's refusal rule; the recycled-pid case is pinned by `src/instance-lock.test.ts` and keeps passing.
- Migration or deletion of the legacy file: it stays merged at load, its records pruning themselves after the far side's expiry.

## Tests

- `src/sessions/store.test.ts` (extend; `node:os` `userInfo` mocked with a switchable account): a second account's `initRemoteSessionStore` + save into the same directory leaves the first account's record readable from a first-account load; both files exist side by side; the discovery reads the legacy `remote-sessions.json`; a duplicate session id across the two files resolves to the newest activity.
- Existing round-trip, parse, prune, merge, and registration tests keep passing, with the two that pin the literal `remote-sessions.json` file name updated to the account-keyed name.
