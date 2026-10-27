# Share the pid lock-file primitive

Complexity rating: 4/10

## Goal

Use one tested implementation for the bare-pid file shared by the project instance lock and remote root-clone lock. Missing files remain available, stale entries are removed only when unchanged, and read errors other than `ENOENT` propagate. In particular, an unreadable remote root lock must reject with its path instead of restarting the acquisition loop without awaiting.

## Approach

Add a small `src/pid-lock-file.ts` module with the shared pid parser, exclusive file creation (including the root lock's optional mode), ENOENT-only reads, and compare-and-remove of stale content. Keep liveness policy in the callers: the instance lock still refuses at once and the root lock still polls every `ROOT_LOCK_POLL_MS` while a live holder remains. Wrap root-lock read failures with a stable error that names the lock path.

## Implementation steps

1. Add the shared lock-file module and refactor `src/instance-lock.ts` and `src/remote/serve-root-lock.ts` to use it without changing their liveness or retry policies.
2. Add focused tests for the shared primitive and a regression test proving a directory at the remote root-lock path rejects promptly with that path in the error.
3. Update the remote-server spec to state that an unreadable root lock fails rather than being treated as free or causing a synchronous retry loop.
4. Check applicable help pages and user documentation; update them only if they already describe this behavior.

## Tests

- Shared primitive tests cover pid parsing, exclusive creation, optional file mode, ENOENT handling, propagation of other read errors, and compare-and-remove behavior.
- `src/remote/serve-root-lock.test.ts` creates a directory at `rootLockPath(...)` and expects `acquireRootLock` to reject with the lock path.
- Existing `src/instance-lock.test.ts`, `src/remote/serve-root-lock.test.ts`, and `src/stop-instance.test.ts` behavior remains covered.

## Specs and docs

- Update `product/specs/remote-server.md` in the missing-clone concurrency section with the unreadable-lock failure behavior.
- `product/specs/cli.md` already describes the instance-lock policy, which does not change.
- `help/` and `documentation/user-documentation/` do not describe remote root-lock internals or this error; no public documentation change is needed.

## Out of scope

- Changing whether either caller treats a live pid as its own instance.
- Changing the instance lock's immediate refusal or the root lock's polling interval, cancellation, or release policy.
- Changing the user-facing handling of a root-offer failure or the lock-file format.
