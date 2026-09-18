# Narrow the instance lock's staleness rule

Issue: the `isPidAlive` EPERM change silently widened the instance lock's staleness rule.

Complexity rating: 3/10

## Goal

`isPidAlive` in `src/instance-lock.ts` used to report false whenever `process.kill(pid, 0)` failed. It now reports **true** on `EPERM`, which is what the detached-peer rendezvous in `src/remote/serve-detach.ts` needs — a peer running under another account is still a peer to dial. The function carries no doc comment saying which question it answers, and its other callers ask a different one.

`acquireLock` writes `process.pid` and reads it back, so its question is never "does some process hold this pid" but "is my earlier janus still running". Under the widened rule a stale lock file whose pid has since been recycled by a process belonging to another user now reports alive, and `janus` refuses to start in that directory with nothing to offer but an instruction to delete the lock file by hand.

`stopInstance` — a third caller the finding does not name — has the same question and a worse consequence: it takes the `true` and calls `process.kill(pid, 'SIGTERM')` on a process it has no permission to signal, which throws `EPERM` out of `janus stop` instead of reporting that nothing is running.

## Approach

Two questions, two functions, each documented with the question it answers rather than left distinguishable only by which one a caller happened to pick.

`isPidAlive` keeps the widened rule and states it: a permission-denied probe means the pid exists under another account and is reported alive; a probe failing any other way is reported dead. Its caller is the rendezvous, which wants to know whether the recorded peer is still there before dialling its socket, and a peer under another account is still there.

`isOwnInstanceAlive` is the narrow one: true only when the probe succeeds outright. This is portable and needs no change to the lock file's format — a recorded pid this process cannot signal is, by construction, not the janus that recorded it, since `acquireLock` writes its own pid while running as the current user. It answers the lock's question and `janus stop`'s question, and both switch to it.

Recording a start time beside the pid was the alternative and is rejected: Node has no portable way to read another process's start time, so it would mean a platform-specific probe and a lock file format change, for a distinction the permission probe already draws.

The cost is stated in the comment rather than left implicit: a project directory shared between two accounts no longer has one user's janus block the other's. That is rarer than a recycled pid, and it fails toward starting rather than toward a lock nobody can clear.

## Implementation steps

1. Add the doc comment to `isPidAlive` in `src/instance-lock.ts`, naming the rendezvous as the caller whose question it answers and pointing at the narrow function for the other.
2. Add `isOwnInstanceAlive` beside it, with the doc comment covering why the lock's question is different, why a permission probe is the right test, and what the narrowing costs.
3. Point `acquireLock` at `isOwnInstanceAlive`.
4. Point `stopInstance` in `src/stop-instance.ts` at it as well, so `janus stop` reports rather than throws.

## Tests

In `src/instance-lock.test.ts`:

- Extend the existing `EPERM`/`ESRCH` table so it covers `isOwnInstanceAlive` too: `EPERM` is alive for `isPidAlive` and not alive for `isOwnInstanceAlive`, `ESRCH` is dead for both.
- `acquireLock` takes the lock over a recorded pid that probes `EPERM` — the recycled-pid-owned-by-someone-else case — and writes its own pid, which no existing case exercises.
- `acquireLock` still refuses a recorded pid that probes clean, which the existing `already running` case covers.

In `src/stop-instance.test.ts`:

- `janus stop` against a locked pid that probes `EPERM` reports no running instance and raises no `SIGTERM`, rather than throwing.

## Out of scope

- The lock file's format, `readLockPid`, and `releaseLock`, none of which change.
- The rendezvous's own use of `isPidAlive`, which keeps the behavior the branch gave it.
- Any attempt to verify that a live pid is actually a janus process rather than merely this user's.

## Specs and docs

- `product/specs/instance-lock.md` (or whichever spec covers the single-instance rule): checked at implementation time and extended only if it states the staleness rule, since a stale lock is now cleared in one case where it previously was not.
- `help.md` and `documentation/user-documentation/`: checked at implementation time; neither documents how staleness is decided.
