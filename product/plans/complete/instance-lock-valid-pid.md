# Accept only a positive integer from the instance lock file, and take the lock exclusively

**Complexity: 3/10**: all of the change is in `src/instance-lock.ts`, which is one small module, and its two callers need no edits. The work is one parser shared by three readers, plus replacing check-then-write with an exclusive create and a single retry.

`src/instance-lock.ts` parses the lock file with `Number(readFileSync(...).trim())` in three places (`readLockPid`, `acquireLock`, and `releaseLock`), and the only value it rejects is `NaN`. An empty or truncated file parses to `0`, and `process.kill` treats both `0` and negative numbers as process groups. So after a crash leaves the lock empty, every later `janus` in that directory refuses to start with "already running (pid 0)", because `process.kill(0, 0)` probes the caller's own process group and succeeds. For the same reason, `janus stop` sends SIGTERM to its own process group. A lock holding `-1` makes `janus stop` signal every process the user owns. `acquireLock` checks whether the file exists and then writes it with a truncating `writeFileSync`, so two `janus` starts in one directory at the same moment can both pass the check and both run.

## Goal

Nothing ever probes or signals a pid unless it could name one real process. Acquiring the lock is a single exclusive create, and a stale or unreadable lock is taken over at most once.

## Approach

All changes are in `src/instance-lock.ts`:

1. **`parseLockPid(content)`**: returns `Number(content.trim())` only when it is a safe integer greater than zero, and `undefined` otherwise. A comment explains why `0` and negative numbers are excluded (`process.kill` treats them as process groups).
2. **`readLockContent(file)`**: the file's text, or `undefined` when the file doesn't exist. Any other read error is rethrown. This replaces the separate `existsSync` check, so a file removed between the check and the read cannot throw.
3. **`readLockPid`** returns `parseLockPid` of the content. `stopInstance` in `src/stop-instance.ts` already reports "no running janus instance" for `undefined`, and `isWorkspaceRunning` in `src/launch-name/leftover.ts` already falls through to its other checks, so neither caller changes.
4. **`releaseLock`** removes the file only when `readLockPid` equals `process.pid`.
5. **`acquireLock`**:
   - Create the directory, then try `writeFileSync(file, String(process.pid), { flag: 'wx' })`. On success, return.
   - On `EEXIST`, read the file through the parser. If it names a live instance of ours (`isOwnInstanceAlive`), refuse with today's message.
   - Otherwise the lock is stale. Remove it, but only if its content hasn't changed since it was judged stale, following the pattern in `src/remote/serve-root-lock.ts`. That way a lock another starter took over a moment ago isn't removed out from under it.
   - Retry the exclusive create once. A second `EEXIST` means another instance won the race, so refuse with the same message, naming that instance's pid when the file shows one.
   - Any other write error propagates.

If `src/instance-lock.ts` grows past the file-size limit, extract the parsing and reading helpers into a new module instead of compacting the file.

The known residual risk is the one the entry names: a stale lock over a recycled pid that this user owns still needs the manual delete described in the error message. There is one narrow window left. A crash in the microseconds between the exclusive create and the write of the pid leaves an empty file, and the parser treats that as stale and takes it over.

## Implementation steps

1. Add `parseLockPid` and `readLockContent`, and route `readLockPid` and `releaseLock` through them. Run `check-diff`.
2. Rewrite `acquireLock` around the exclusive create, the stale takeover, and the single retry. Run `check-diff`.
3. Add the tests below. Run `check-diff`.

## Tests

`src/instance-lock.test.ts`. `process.kill` is stubbed in every new case, so a wrong implementation can never signal the test runner's process group.
- For each of `''`, `'0'`, `'-1'`, and `'not-a-pid'`, `acquireLock` takes the lock over and records `process.pid` without ever probing the file's value with `process.kill`, and `readLockPid` returns `undefined`.
- A lost race: while `acquireLock` is judging a stale lock, another instance replaces it. This is simulated by a `process.kill` stub that reports the old pid dead and rewrites the file with another pid. `acquireLock` then refuses with "already running", and the other instance's lock is left in place.
- `releaseLock` leaves an unparseable lock file in place, because it isn't this process's lock.

`src/stop-instance.test.ts`:
- With an empty lock file, `stopInstance` reports "no running janus instance" and never calls `process.kill` with a signal. `process.kill` is stubbed before the file is written.

Existing acquisition, stale-takeover, release, and `stopInstance` cases must keep passing unchanged.

## Spec

`product/specs/cli.md`: in the startup sequence's lock step, add that a lock file that doesn't record a valid process ID (empty, zero, negative, or not a number) is treated as stale and taken over, and that the lock is created exclusively, so two instances starting in one directory at the same moment cannot both run. In the `janus stop` section, add that a lock file that doesn't record a valid process ID is reported the same way as a missing one.

## Out of scope

- `src/remote/serve-root-lock.ts`, which already validates its pid and creates its lock with `wx`.
- Recording anything beyond a bare pid in the lock file, such as a start time to detect a recycled pid that this user owns.
