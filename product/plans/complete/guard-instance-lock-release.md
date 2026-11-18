# Guard instance-lock release against a lock takeover

**Complexity: 2/10** — 1 production file, ~7 added lines, 3 requirements and 4 test scenarios (p=3.90); a guarded removal that reuses `clearIfStale`.

## Goal

`releaseLock` in `src/instance-lock.ts` deletes `.janissary/lock` whenever a first read sees this process's pid. Acquisition in the same module treats a lock that changed between read and write as a reason to refuse, using `clearIfStale` from `src/pid-lock-file.ts` to remove only a file still holding the exact content that was judged stale. Release applies the looser rule: a lock judged stale and taken over by a third process between the read and the delete is removed unconditionally, admitting a second instance into the directory.

Make release apply the same guarded removal, so shutdown deletes the lock only while it still names this process.

## Approach

Read the lock's exact text through `readPidFile`, confirm it parses to `process.pid`, then hand that exact text to `clearIfStale`, which re-reads immediately before removing and deletes only when the content is unchanged. This mirrors `acquireLock`'s staleness path and leaves a lock a different starter took over in place, so that starter keeps the directory instead of having it cleared out from under them during this instance's shutdown. No change to the lock file format, to acquisition, or to the stop path.

## Implementation steps

1. In `src/instance-lock.ts`, import `readPidFile` from `./pid-lock-file.js` and drop the now-unused `rmSync` import from `node:fs`.
2. Replace the body of `releaseLock`: resolve the lock path once, read the raw content with `readPidFile`, and, only when the content is present and `parseLockPid(content) === process.pid`, call `clearIfStale(file, content)`.

## Tests

In `src/instance-lock.test.ts`, add a `releaseLock` case where the lock content changes between the first read and the removal: seed the lock with this process's pid, arrange for the re-read performed by `clearIfStale` to observe different content (spy on the `node:fs` namespace's `readFileSync` so the first read returns this pid and a later read returns a foreign pid), call `releaseLock`, and assert the original file still holds the new content. Keep the existing matching, foreign-pid, and invalid-pid release cases passing.

## Out of scope

- The lock file format, `readLockPid`, `acquireLock`, and `janus stop` behavior.
- Making the read and delete genuinely atomic. `clearIfStale` still uses two syscalls and only narrows the race.
- Any change to how large or otherwise unusual pid values are parsed.

## Specs and docs

- `product/specs/state-directory.md`: add one sentence to the PID-lock paragraph noting that shutdown removes the lock only while it still names the shutting-down process, so a lock another starter took over survives.
- `help/` and `documentation/user-documentation/`: checked at implementation time. Neither documents the lock's release behavior, so no change is expected.
