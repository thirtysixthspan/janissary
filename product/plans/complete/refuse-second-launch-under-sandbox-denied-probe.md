# Refuse a second launch when the sandbox denies the instance-lock liveness probe

**Complexity: 4/10** — 10 requirements, 9 test scenarios, ~36 added lines across 1 production file (p=5.224)

## Goal

While one janus instance runs in a directory, a second launch must exit nonzero with `another janus instance is already running in this directory` and leave `latest.log` and the first run's log untouched (work item; PR description How to verify step 3; `product/specs/cli.md:46` and `:70`). A sandbox that permits signalling only descendants makes `process.kill(pid, 0)` answer `EPERM` for the live detached server, so `isOwnInstanceAlive` in `src/instance-lock.ts` calls that lock stale and admits a second launch, which then repoints `latest.log`. The fix gives the narrow liveness check a permission-free way to tell a live process owned by this account from a dead or foreign one. The bare-pid lock file and the cross-account staleness rule stay exactly as they are.

## Requirements

1. A second launch against a directory whose lock names a live instance owned by this account is refused ("Expect: the second launch is refused with the already-running message" — work item).
2. The refusal names the directory and the live process ID and points at the lock file with deletion guidance ("the message names the directory and the live process ID" — `product/specs/cli.md:46`).
3. A refused launch leaves `latest.log` pointing at the first run's file ("the link still names the first run's file" — work item).
4. A refused launch leaves the first run's log byte-for-byte unchanged, including its `__JANUS_URL__` line ("that first file still holds its `__JANUS_URL__` line" — work item).
5. A lock naming a process the current user cannot signal but that belongs to another account is stale and taken over without deleting the file by hand ("A lock naming a process the current user cannot signal is treated as stale and taken over, since a recorded process ID that has been recycled by another account's process cannot be the instance that recorded it" — `product/specs/cli.md:56`).
6. A lock naming a dead pid is stale and taken over (`product/specs/cli.md:56`; `src/instance-lock.test.ts` "succeeds when the lock file contains a pid that is not alive").
7. A lock file that does not record a valid pid is stale, taken over, and never probed or signalled ("empty, zero, negative, or not a number, as a crash mid-write can leave it — is likewise stale and taken over, and is never probed or signalled" — `product/specs/cli.md:56`).
8. A lock naming a live pid this user can signal remains held, so a second launch is refused (`product/specs/cli.md:56`; `src/instance-lock.test.ts` "throws when a second call targets a directory already locked by a live pid").
9. `janus stop` treats a live process owned by this account as running even when the signal probe is denied ("if the recorded process ID is alive, sends it SIGTERM" — `product/specs/cli.md:89`; finding: "The same cause made `janus stop` report 'no running janus instance' against a live app").
10. The lock file keeps holding a bare pid, with no start time or account marker added (doc comment in `src/instance-lock.ts`: "leaves the lock file a bare pid"; `product/plans/complete/narrow-the-instance-lock-staleness-rule.md:21`).

## Design decisions

- The permission probe alone no longer decides ownership. The sandbox profile allows `signal` only for `(target children)` (`src/sandbox/profile.ts:185-191`), and the janus server is spawned detached (`bin/janus.mjs:120`), so a new launch is not its parent and gets `EPERM` for a process this same account started.
- A new `pidBelongsToCurrentUser` helper asks the OS process table for the pid's numeric owner and compares it with `process.getuid()`. A matching owner with a denied probe means this account's live instance; a foreign owner or a pid the process table does not list means stale. No lock-file format change is needed.
- `ESRCH` and an unreadable owner stay dead. A recycled pid originally owned by another account, or a pid that no longer exists, has no owner to match, so the lock is still taken over (Requirements 5 and 6).
- Every existing caller of `isOwnInstanceAlive` (`acquireLock`, `stopInstance`, `isWorkspaceRunning`, `acquireRootLock`) keeps calling it and gets the single corrected answer; none of them change.
- The fix lives entirely in the lock's liveness check. A refused launch still throws before readiness (`src/main.ts:71`), so the launcher's already-promised "refused launch keeps `latest.log` and the earlier log" behavior is what makes Requirements 3 and 4 true; the launcher and `bin/server-log.mjs` are untouched.

## Preserved behavior

1. `acquireLock` takes over a lock held by a pid owned by another account and writes its own pid; it must not report `already running` for that foreign pid. Test: `src/instance-lock.test.ts` "takes a stale lock over a recycled pid owned by another account".
2. `isPidAlive` reports `EPERM` as alive for the detached-peer rendezvous; it must not flip to `false`. Test: `src/instance-lock.test.ts` "treats PID probe EPERM as alive=true".
3. `janus stop` reports `no running janus instance` for a foreign `EPERM` pid and raises no SIGTERM; it must not signal another account's process. Test: `src/stop-instance.test.ts` "reports no running instance when the locked pid belongs to another account".
4. A lock file holding an empty value, `0`, a negative number, or non-numeric text is taken over without any signal probe. Test: `src/instance-lock.test.ts` "takes over a lock file holding \"\" without probing it".
5. Another starter that takes over a stale lock mid-probe still wins; the fresh lock survives and this start is refused. Test: `src/instance-lock.test.ts` "refuses when another instance takes over a stale lock first".

## Assumptions

1. `acquireLock` writes `process.pid` and reads it back, so the lock never asks "does some process hold this pid" but "is my earlier janus still running" (`src/instance-lock.ts:30-31`).
2. The sandbox denies `signal` to processes outside the caller's subtree, so `process.kill(pid, 0)` returns `EPERM` for the detached server even though this account started it (`src/sandbox/profile.ts:185-191`).
3. `ps -p <pid> -o uid=` prints the numeric owner on macOS and Linux, and the Janissary profile allows `process-exec` and `sysctl-read`, which are what that query needs (`src/sandbox/profile.ts:52` and `:183`).
4. `ESRCH` still means no process holds the pid, so a genuinely dead pid remains distinguishable from a denied probe (`src/instance-lock.ts:45-52`).
5. An instance lock throws before the server reaches readiness, so `pointLatestLog` is never called on the refused launch (`src/main.ts:71`; `bin/janus.mjs:123-128`).

## Existing functionality

1. The two-question split, `isPidAlive` for "some process holds this pid" and `isOwnInstanceAlive` for "is this my earlier instance", with both doc comments (`src/instance-lock.ts:17` and `:45`).
2. The exclusive-create stale-lock takeover and guarded removal (`src/pid-lock-file.ts:10` `createPidFile`, `:30` `clearIfStale`; `src/instance-lock.ts:76-85` `acquireLock`).
3. The exact refusal message builder, `alreadyRunning(file, pid)` (`src/instance-lock.ts:65-70`).
4. The `vi.mock('node:fs', async (importOriginal) => ...)` and `vi.spyOn(process, 'kill')` test pattern (`src/instance-lock.test.ts:8-24`).
5. The earlier plan that established the narrow rule and rejected recording a start time because no portable Node API can read another process's start time (`product/plans/complete/narrow-the-instance-lock-staleness-rule.md:21-25`).

## Implementation steps

1. **Process-owner helper.** Add `src/process-owner.ts` exporting `pidBelongsToCurrentUser(pid)`. It reads the current account's uid with `process.getuid()` when available and asks the process table with `execFileSync('ps', ['-p', String(pid), '-o', 'uid='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })`, treating a matching numeric uid as `true` and an empty result, a foreign uid, or any thrown error (including a denied `ps`) as `false`. A short comment explains why a denied `process.kill` probe no longer proves foreign ownership. Write `src/process-owner.test.ts` in the next step. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Narrow liveness check.** Import the helper into `src/instance-lock.ts` and change `isOwnInstanceAlive` so a successful probe still returns `true`, `ESRCH` and every other error still return `false`, and `EPERM` returns `pidBelongsToCurrentUser(pid)`. Update that function's doc comment: it now answers "could this pid still be this account's instance" even when signalling is denied, and it still answers `false` for a foreign or recycled pid. Leave `isPidAlive`, `acquireLock`, `readLockPid`, and `releaseLock` unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Tests.** Add `src/process-owner.test.ts` with `execFileSync` mocked through `vi.mock('node:child_process', async (importOriginal) => ...)` and the real `process.getuid()` value driving the output: owned uid, foreign uid, a process-table failure, and empty output. Add to `src/instance-lock.test.ts` a mock of `./process-owner.js`, a reset in `beforeEach`, one assertion that an `EPERM` probe of a pid owned by this account is alive, and one `acquireLock` assertion that the same state refuses a second launch with the pid in the message and leaves the lock file unchanged. Keep every existing test byte-for-byte. Build command: `$janissary/scripts/run.mjs check-diff`.
4. **Spec.** Update `product/specs/cli.md:56` to state that a lock whose signal probe is denied but whose pid belongs to the current account is held, while a pid owned by another account is stale; adjust `:89` so `janus stop`'s live-pid rule reads the same way. No help page describes the staleness rule, so no `help/` file changes. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is confined to the server-side instance lock; no UI surface, command, flag, or key binding changes.

## Tests

- `src/process-owner.test.ts`: a live process owned by this account answers `true` (Requirements 1 and 9); a pid owned by another account answers `false` (Requirement 5); a pid the process table does not list answers `false` (Requirement 6); empty or unparseable output answers `false` (Requirement 6).
- `src/instance-lock.test.ts`: `isOwnInstanceAlive` with an `EPERM` probe and an owned pid answers `true` (Requirements 1 and 9); `acquireLock` with that state throws `/already running in this directory \(pid 424242\)/` and leaves `424242` in the lock file (Requirements 1, 2, 3, 4); the existing `EPERM`/`ESRCH` table still answers `false` when no owner can be read (Requirements 5 and 6); the invalid-lock cases still avoid any probe (Requirement 7); the clean-probe case still refuses (Requirement 8).
- Existing `src/stop-instance.test.ts` cases are unchanged and still pin Requirement 5's stop-side behavior.

## Out of scope

- No lock-file format change, no recorded uid or start time. Recording a start time was explicitly rejected in `product/plans/complete/narrow-the-instance-lock-staleness-rule.md:23`.
- No change to `isPidAlive` or the detached-peer rendezvous that uses it.
- No change to `bin/janus.mjs`, `bin/server-log.mjs`, log reaping, or the `latest.log` link mechanics.
- No change to how `janus stop` delivers SIGTERM. It now identifies a live owned pid correctly, but a sandbox that denies the signal itself still surfaces that OS error.
- No help page or user and developer documentation edits.
- No PR description correction. How to verify step 3 already states the behavior this fix makes true, so its text stays as the author wrote it.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Refused second launch.** In a scratch git project with `.janissary/config.json` holding `{"logEnabled": false, "logRetentionInDays": 7}`, run `node bin/janus.mjs --no-open <scratch>` and take the address from `<scratch>/.janissary/logs/server/latest.log`. Confirm it answers HTTP 200, record `readlink` of `latest.log` and the pid in `.janissary/lock`, then run the same launch command again. Expect a nonzero exit, `another janus instance is already running in this directory (pid <first pid>)` on stderr, and `readlink` plus the first log's bytes unchanged. Failure looks like a fresh address on stdout, an empty stderr, and `latest.log` moved to the second run's file.
3. **Foreign pid still stale.** In a scratch project, write a lock file naming a pid owned by another account, then launch. Expect the lock to be taken over and the launch to succeed with no `already running` message. Failure looks like a refusal that tells the user to delete the lock by hand.
