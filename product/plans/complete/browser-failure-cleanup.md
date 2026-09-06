# Plan: Release the e2e browser's resources on every way it can end

**Complexity: 4/10** — one new module holding the launch's acquired resources and its single teardown, `e2e-server.ts` rewired onto it, and a rollback at the two places that take ownership of the handle. No new lifecycle owner and no supervision.

## Goal

`startE2EBrowserServer` has one teardown path, `handle.close()`, and it is reachable only from tab disposal. Every other way the browser can end just notifies:

- A guard that cannot bind calls `onGone` and stops there. Its child is already spawned, so a confined Chromium and its scratch directory stay alive for the lifetime of the tab, reachable by nothing.
- A child that fails to start, or exits unexpectedly, calls `onGone` and stops there. The guard keeps listening on the published port, so the endpoint the agent holds stays open and every connection through it hangs on an upstream that is gone.
- A synchronous failure part-way through setup leaks whatever was already acquired. The scratch directory is allocated first, so a throw from the guard's construction strands a directory nothing will ever remove.

Ownership is also assumed rather than established. `finishSpawn` starts the browser, spawns the PTY, and only then builds the `HarnessRuntime` that owns the handle; a throw from the PTY spawn or the runtime construction strands a fully started browser with no owner. `RemoteProcesses.spawnPty` records the handle in `this.browsers` and then calls `spawnPty`; a throw there propagates out of `spawn()` before the session is entered in `this.entries`, so neither `kill` nor `finish` will ever reach the handle it just stored.

Every one of these should end the same way an ordinary close does: guard stopped, child killed, scratch removed — with the notification still fired exactly once, and still never after the user closed the tab themselves.

## Approach

**One teardown, driven by what was acquired.** Add `src/browser/e2e-session.ts`. A session is the two flags the current code already keeps (`closed`, `fired`), the `onGone` callback, and three optional slots filled in as the guard, the child, and the scratch allocation are acquired. `stopSession(session, message?)` is the only way any of them is released:

- it decides whether to notify *before* it marks the session down — a message notifies only when the session was neither already down nor already reported;
- it marks the session down first, so anything the teardown itself triggers (killing the child fires its own `exit`) is suppressed rather than recursing;
- it releases whichever slots are filled, so a partial setup gives back exactly what it took;
- it notifies last, so the resources are gone by the time the user hears about it.

The existing guarantees fall straight out of that: `close()` passes no message and so is silent; a second `gone` is suppressed by `fired`; a `gone` after `close()` is suppressed by `closed`; `close()` after a failure re-releases nothing.

**Every failure routes through it.** The guard's `onError`, the child's `error` event, the child's `exit` event, and `handle.close()` all call `stopSession`. The whole acquisition sequence sits inside one `try`, so a throw from the scratch allocation, the guard construction, or the spawn is reported through `onGone` and rolled back rather than propagating — `startE2EBrowserServer` must not throw at its caller, which is mid-way through building a tab. `spawnBrowserChild` loses its own private `try`/`catch`, since the outer one now produces the same message.

**Ownership is established, then failures release it.** `finishSpawn` wraps the PTY registration and runtime construction so a throw closes the handle before it propagates; `RemoteProcesses.spawnPty` wraps its `spawnPty` call the same way, closing and forgetting the browser it recorded a moment earlier. Both rethrow: the caller's own failure handling is unchanged, only the leak is fixed.

Restart stays out of scope. Once the browser is gone it is gone, and now it is gone *completely*.

## Implementation steps

1. Add `src/browser/e2e-session.ts` with `E2ESession`, `newSession(onGone)`, and `stopSession(session, message?)`.
2. Rewrite `startE2EBrowserServer` onto it: build the session, fill its slots inside one `try`, report and roll back in the `catch`, and return a handle whose `close` is `stopSession(session)`. Drop `closeHandle` and the local `gone`/`state` pair.
3. Have `spawnBrowserChild` take the session, register its `error` and `exit` handlers against `stopSession`, and drop its internal `catch`.
4. `src/harness/manager.ts` — close `spawnEnv.handle` when the PTY registration or runtime construction throws, then rethrow.
5. `src/remote/serve-processes.ts` — close and forget the recorded browser when `spawnPty` throws, then rethrow.
6. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- `src/browser/e2e-server.test.ts` — the failure transitions, not just the notifications the suite asserts today:
  - a guard that cannot listen kills the child and removes the scratch allocation, as well as notifying;
  - a child that exits unexpectedly stops the guard and removes the scratch allocation;
  - a child that never starts (the `error` event) does the same;
  - a spawn that throws outright releases the guard and the scratch allocation, and the returned handle still closes without throwing;
  - a scratch allocation that throws reports through `onGone`, starts no guard and no child, and still returns a closable handle rather than propagating;
  - the teardown runs once across a failure followed by a `close()`, and once across a `close()` followed by the child's exit;
  - killing the child during teardown cannot re-enter the teardown or fire a second notification.
- `src/harness/manager.test.ts` — a `-b` launch whose PTY spawn throws closes the browser handle before the error propagates, and a launch whose PTY spawn succeeds does not.
- `src/remote/serve-processes.test.ts` — a `-b` spawn whose PTY creation throws closes the browser handle before the error propagates, and a later `kill` for that id does not close it a second time.

## Spec and documentation

`product/specs/harness.md` says a browser that is gone produces a notification and that closing the tab stops the browser and removes its scratch directory. That gains the missing half: a browser that ends on its own — a failed launch, a child that exited, a guard that could not listen — releases the same resources at that moment rather than holding them until the tab closes. `product/specs/remote-server.md` says the remote owns its own guard, browser, and scratch directory; it gains the same clause for a spawn that fails on the far side. No `help.md` or user-documentation change: the user-visible notification is unchanged.

## Out of scope

- Restarting a browser, guard, or child that died, or any supervision loop.
- Reporting the failure anywhere other than the existing notification.
- Cleanup ordering against a child that is slow to die. `kill()` is a signal, not a join, and turning it into one would make a synchronous close asynchronous.
- The remaining browser findings in `product/backlog/pull-request.md`.
