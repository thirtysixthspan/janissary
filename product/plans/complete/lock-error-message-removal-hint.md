# Explain how to remove the lock file in the instance-lock error message

**Complexity: 1/10** — a single string change in one function, plus a matching test assertion and a one-line spec update.

## Goal

When `janus` refuses to start because another live instance already holds the lock on the target directory, the error message tells the user how to run a second instance elsewhere (`janus <other-directory>`), but gives no guidance for the case where the user knows the lock is stale or wants to clear it manually. Add a sentence naming the lock file's location and how to remove it, so a user stuck with a wedged/incorrect lock isn't left guessing.

## Approach

`acquireLock` in `src/instance-lock.ts` already computes the lock file's path locally as `file`. Extend the thrown `Error` message with a second sentence that names the path and instructs the user to delete it if they are sure no other instance is running.

## Implementation steps

1. **`src/instance-lock.ts`** — in `acquireLock`, extend the error message thrown when `isPidAlive(pid)` is true to add a sentence naming the lock file path and telling the user to delete it if they're sure no other instance is running:
   ```ts
   throw new Error(
     `another janus instance is already running in this directory (pid ${pid}). Run janus <other-directory> to start a second instance elsewhere. If you're sure no other instance is running, delete ${file} to clear the lock.`,
   );
   ```

## Tests

- **`src/instance-lock.test.ts`** — extend the existing test `'throws when a second call targets a directory already locked by a live pid'` (or add a new assertion alongside it) to also match the removal guidance, e.g. `expect(() => acquireLock(projectDir)).toThrow(/delete .*lock/);`.

## Spec updates

- **`product/specs/cli.md`** — the "Another `janus` instance is already running..." bullet under `### Startup failures` (line 39) currently only mentions the directory, PID, and the `janus <other-directory>` suggestion. Add that the message also names the lock file's path and explains how to remove it to clear a stale lock.

## Verification

- `./scripts/run.mjs check-diff` — lints the changed file, typechecks incrementally, and runs `src/instance-lock.test.ts`.
- Manual verification is not practical in this environment (would require starting two concurrent `janus` processes against the same directory); the behavior is fully covered by the unit test instead.

## Out of scope

- Any change to the stale-lock **detection** logic (`isPidAlive`) — this fix only changes the message text for the already-correct "another process is alive" path.
- Other startup-failure messages (port in use, missing web bundle) — untouched.
