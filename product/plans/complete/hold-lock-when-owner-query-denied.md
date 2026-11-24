# Hold the instance lock when the sandbox denies the owner query too

**Complexity: 4/10** — 10 requirements, 11 test scenarios, ~10 added lines across 2 production files (p=5.177)

## Goal

A second launch against a directory with a live janus instance must still be refused, and `janus stop` must still signal that instance, when the sandbox denies both the signal probe and the process-table owner query. The previous repair made `isOwnInstanceAlive` ask `pidBelongsToCurrentUser` after `process.kill(pid, 0)` returned `EPERM`, but this sandbox also denies executing `ps` with `EPERM`, so the helper returns `false` and the live owned pid is judged stale: the second launch steals `latest.log` and `janus stop` prints `no running janus instance`. The fix makes the denied owner query fail closed while keeping the documented cross-account stale takeover for pids positively shown to belong to another uid.

## Requirements

1. A lock whose live pid is owned by this account and whose signal probe is denied is held, so a second launch is refused ("A process owned by the current user is still live even when a sandbox denies the signal probe, so its lock is held and the second launch is refused" — `product/specs/cli.md:56`).
2. The refusal leaves the first pid in the lock file rather than overwriting it (work item: "the link still names the first run's file"; existing `alreadyRunning` message includes the pid).
3. `janus stop` signals a locked pid whose signal probe is denied and whose owner query cannot be read ("A process owned by the current user counts as alive even when a sandbox denies the signal probe" — `product/specs/cli.md:89`).
4. A lock is treated as stale and taken over only when the owner query positively reports a different account ("A recorded process ID the current user cannot signal is stale and taken over when it belongs to another account" — `product/specs/cli.md:56`).
5. A dead pid still makes the lock stale, so it is taken over (`product/specs/cli.md:56`; existing test "succeeds when the lock file contains a pid that is not alive").
6. A process-table query that exits because the pid is not listed is a definitive "not ours" answer, so the lock stays stale (existing test "rejects a pid the process table does not list").
7. A lock file that does not record a valid pid is taken over without any signal probe or owner query ("empty, zero, negative, or not a number, as a crash mid-write can leave it — is likewise stale and taken over, and is never probed or signalled" — `product/specs/cli.md:56`).
8. A successful signal probe still means the pid is alive (`product/specs/cli.md:56`).
9. The lock file keeps holding a bare pid, with no start time or account marker (work item: "leave the lock file a bare pid").
10. `janus stop` keeps its exact message and exit-0 behavior when nothing is running ("it prints `no running janus instance for <dir>` and exits 0" — `product/specs/cli.md:89`).

## Design decisions

- The owner query answers three states, not two: `true` for a positively matching uid, `false` for a positively foreign uid or a process table that does not list the pid, and `undefined` when the query itself is unavailable (an OS-level failure such as `EPERM` or `ENOENT`). This keeps `pidBelongsToCurrentUser` honest: it only claims ownership when it can read one.
- `isOwnInstanceAlive` fails closed on a denied signal probe: it returns `pidBelongsToCurrentUser(pid) !== false`, so an unreadable owner keeps the lock held and lets `janus stop` signal. Only a positive foreign answer yields stale.
- A process-table exit status (a numeric `code`, such as `ps` exiting 1 for a missing pid) is a definitive answer and stays `false`; only OS-level errors, whose `code` is a string, are reported as unavailable. Empty output stays a definitive `false`, preserving the existing process-owner tests.
- No new export or module is added. `instance-lock.ts` keeps importing the same helper, so the `vi.mock('./process-owner.js', ...)` in the existing lock tests stays valid and every caller of `isOwnInstanceAlive` — `acquireLock`, `stopInstance`, `isWorkspaceRunning`, `acquireRootLock` — gets the corrected answer without changes.
- The lock file format, the already-running message, the `no running janus instance` message, and SIGTERM delivery are unchanged.

## Preserved behavior

1. `acquireLock` takes over a lock naming a pid positively owned by another account and writes its own pid; it must not report `already running`. Test: `src/instance-lock.test.ts` "takes a stale lock over a recycled pid owned by another account".
2. `isPidAlive` reports `EPERM` as alive for the detached-peer rendezvous; it must not flip to `false`. Test: `src/instance-lock.test.ts` "treats PID probe EPERM as alive=true".
3. `janus stop` reports `no running janus instance` for a foreign `EPERM` pid and raises no SIGTERM; it must not signal another account's process. Test: `src/stop-instance.test.ts` "reports no running instance when the locked pid belongs to another account".
4. A lock holding an empty value, `0`, a negative number, or non-numeric text is taken over without any signal probe. Test: `src/instance-lock.test.ts` "takes over a lock file holding \"\" without probing it".
5. Another starter that takes over a stale lock mid-probe still wins and this start is refused. Test: `src/instance-lock.test.ts` "refuses when another instance takes over a stale lock first".
6. The process-table helper still reports a foreign uid and a missing pid as `false`. Test: `src/process-owner.test.ts` "rejects a pid owned by another account".

## Assumptions

1. `acquireLock` probes only a valid lock pid with `isOwnInstanceAlive` and otherwise takes the lock over (`src/instance-lock.ts:80-84` `acquireLock`).
2. This sandbox denies `process.kill(pid, 0)` for the detached server and denies executing `ps` with `EPERM`, so both the signal probe and the owner query fail the same way (work item: "this harness sandbox denies executing `ps` with `EPERM`").
3. Node reports a denied `spawnSync` with a string `code` of `EPERM`, and an exited `ps` with a numeric `code` of 1, so the two failure kinds are distinguishable (`src/process-owner.ts:16` `catch`).
4. `ESRCH` still means no process holds the pid, so a dead pid remains dead regardless of the owner query (`src/instance-lock.ts:49-51`).
5. A refused launch throws before readiness, so the earlier log and `latest.log` link are untouched (`src/main.ts:71`; `product/plans/complete/refuse-second-launch-under-sandbox-denied-probe.md:44`).

## Existing functionality

1. The narrow liveness check and its doc comment (`src/instance-lock.ts:45-52` `isOwnInstanceAlive`).
2. The owner query through `ps -p <pid> -o uid=` with `process.getuid()` (`src/process-owner.ts:7-18` `pidBelongsToCurrentUser`).
3. The exclusive-create stale-lock takeover and guarded removal (`src/pid-lock-file.ts:10` `createPidFile`, `:30` `clearIfStale`; `src/instance-lock.ts:76-85`).
4. The exact already-running message builder (`src/instance-lock.ts:65-70` `alreadyRunning`).
5. The `vi.spyOn(process, 'kill')` and `vi.mock('./process-owner.js', ...)` test patterns (`src/instance-lock.test.ts:9-14`); the `vi.mock('node:child_process', ...)` pattern (`src/process-owner.test.ts:6-9`).

## Implementation steps

1. **Owner query states.** In `src/process-owner.ts`, widen `pidBelongsToCurrentUser`'s return type to `boolean | undefined`. In its `catch`, return `undefined` when `error.code` is a string (an OS-level failure such as `EPERM` or `ENOENT`) and `false` when it is numeric (an exited `ps`, such as code 1 for a missing pid). Leave the owned-uid, foreign-uid, and empty-output paths returning `true`/`false` exactly as they do. Update the doc comment to state the three answers and why an unreadable owner must not be called "not ours". Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Fail-closed liveness check.** In `src/instance-lock.ts`, change `isOwnInstanceAlive`'s `EPERM` branch to `pidBelongsToCurrentUser(pid) !== false`, keeping a successful probe as `true` and every other error as `false`. Update its doc comment to say that a denied owner query keeps the lock held and is only released as stale when the owner is positively foreign. Leave `isPidAlive`, `acquireLock`, `readLockPid`, and `releaseLock` unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
3. **Tests.** Add to `src/process-owner.test.ts` a case where `execFileSync` throws `EPERM` and the helper answers `undefined`. Add to `src/instance-lock.test.ts` an `isOwnInstanceAlive` case with an `EPERM` probe and an `undefined` owner answer, plus an `acquireLock` case asserting that state refuses a second launch with the pid in the message and leaves the lock file unchanged. In `src/stop-instance.test.ts`, mock `./process-owner.js`, set the foreign owner explicitly in the existing foreign-owner case so its assertion holds in a sandbox that denies `ps`, and add a case where an `EPERM` probe with an unavailable owner still sends SIGTERM. Keep every existing assertion unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
4. **Spec.** Extend `product/specs/cli.md:56` and `:89` so the already-documented denied-signal-probe rule also covers a denied owner query, keeping the refusal and no-running messages verbatim. No help page describes this staleness rule, so no `help/` file changes. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change is confined to the server-side instance lock; no UI surface, command, flag, or key binding changes.

## Tests

- `src/process-owner.test.ts`: `execFileSync` throwing `EPERM` answers `undefined` (Requirements 3 and 4); an exited `ps` and empty output still answer `false` (Requirement 6); a foreign uid still answers `false` (Requirement 4).
- `src/instance-lock.test.ts`: `isOwnInstanceAlive` with an `EPERM` probe and an unavailable owner answers `true` (Requirements 1 and 3); `acquireLock` in that state throws `/already running in this directory \(pid 424242\)/` and leaves `424242` in the file (Requirements 1 and 2); a positively foreign owner still takes the lock over (Requirement 4); a dead pid is taken over (Requirement 5); an invalid lock is never probed (Requirement 7); a clean probe still refuses (Requirement 8).
- `src/stop-instance.test.ts`: an `EPERM` probe with an unavailable owner still sends SIGTERM (Requirement 3); a positively foreign `EPERM` pid prints `no running janus instance for <dir>` and sends nothing (Requirements 4 and 10); a dead or invalid lock does the same (Requirements 5, 7, and 10).

## Out of scope

- No lock-file format change, no recorded uid or start time.
- No change to `isPidAlive` or the detached-peer rendezvous that uses it.
- No change to `bin/janus.mjs`, `bin/server-log.mjs`, log reaping, or the `latest.log` link mechanics.
- No change to how `janus stop` delivers SIGTERM, its message, or its exit code.
- No help page or user and developer documentation edits.
- No PR description correction: the description's verification steps already state the behavior this fix restores.

## Verification

1. `$janissary/scripts/run.mjs check-diff`
2. **Refused second launch with both probes denied.** In a scratch git project with `.janissary/config.json` holding `{"logEnabled": false, "logRetentionInDays": 7}`, run `node bin/janus.mjs --no-open <scratch>` and take the address from `<scratch>/.janissary/logs/server/latest.log`. Confirm it answers HTTP 200, record `readlink` of `latest.log` and the pid in `.janissary/lock`, then run the same launch again. Expect a nonzero exit, `another janus instance is already running in this directory (pid <first pid>)`, and an unchanged `readlink` and first log. Failure looks like a fresh address, empty stderr, and a moved `latest.log`.
3. **Stop with both probes denied.** Run `node bin/janus.mjs stop <scratch>` against that live instance. Expect the address to stop answering and no `no running janus instance` message; failure looks like that message while the address still answers 200.
4. **Foreign pid still stale.** In a scratch project, write a lock naming a pid positively owned by another account and launch. Expect a takeover and a successful start with no refusal message.
