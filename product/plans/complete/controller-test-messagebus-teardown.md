# Controller test teardown leak (intermittent timeouts)

Bug: controller tests are intermittently failing — the five `Controller notifications feed` tests in `src/controller.test.ts` time out (5000ms) when the file runs whole, while passing individually.

Complexity rating: 2/10

## Replication (Step 1)

- `npx vitest run --project server src/controller.test.ts` → the five notifications-feed tests fail with "Test timed out in 5000ms"; `npx vitest run ... --testTimeout=30000` shows each genuinely takes 7.5–8.8s (7794→8757ms growing across the five), so the bodies really run slow — they are not hung.
- Probed the first body with timestamped logging (temporary instrumented copy of the test file, since removed): `dispatch('agent bob --no-workspace')`, `openNotificationsTab`, `setActiveTab` are all fast; the whole ~9.5s is inside `c.dispatch('msg bob info hello there')`.
- Each test passes in under 30ms when run in isolation (`-t "notifications feed"`), so the slowness comes from accumulated state left by earlier tests.
- Bisecting by name filters found no single predecessor; the cost grows with the *number of controllers* created earlier.

## Root cause

`wireControllerEvents` (src/controller/events.ts) subscribes the controller's transcript/state/pty handlers onto the module-global `messageBus` for "the lifetime of the process". `Controller.shutdown()` is the only place that unsubscribes (`messageBus.clear()`) — and the tests never call it. Every `createController()` call in the file therefore leaves another live listener set (plus a started schedule interval). By the time the feed tests run, ~165 stale controller listeners exist, and the `msg` dispatch's `entry:appended` emit fans out into all of them, each stale listener doing its own sync persistence and `notify()` (and notify's append re-emits), a blowup that scales with test count and machine speed — failing just past the 5s default timeout on some runs, machines, and file subsets, hence "intermittent".

## Correct behavior (Step 2)

Each test's controller must not outlive its test: no listeners, no scheduler interval, no further persistence after the test ends, so any test runs against a clean bus regardless of what came before. `Controller.shutdown()` is exactly this teardown; the tests are simply not invoking it.

## Approach

Test-only fix in `src/controller.test.ts` — the product code is right (one controller per process; `shutdown()` exists and clears):

1. Track every controller the tests create: `makeController()` pushes its controller into a module-level array, and the few tests that call `createController()` directly (rootDir, quit/exit aliases) push theirs too.
2. A top-level `afterEach` shuts every tracked controller down (`c.shutdown()`), which clears the message bus and disposes each manager (including the scheduler interval). Idempotent by construction (double dispose is a no-op for the `clearInterval`-style disposes), so tests that already shut down are unaffected.

## Regression test

A cross-controller isolation test in `Controller notifications feed`: create two controllers, post an `msg` in the second to a recipient only the second has, and assert the message reaches the second controller's feed while the first controller's feed stays empty. Without the fix the leaked listener makes the stale controller open its own notifications feed and record the second controller's message (`Message from janus in carla`) — a deterministic, value-level failure observable before any timing. The five previously-timing-out tests are the empirical regression evidence: ~8s each before the fix, tens of milliseconds after.

## Implementation steps

1. In `src/controller.test.ts`: add `liveControllers`, push from `makeController`, wrap the direct `createController()` callers, add top-level `afterEach` shutdown loop.
2. Add the cross-controller isolation test to `Controller notifications feed`.
3. Delete nothing else; the probe file gathered in replication is already removed.

## Verification

- `npx vitest run --project server src/controller.test.ts` passes with default 5s timeouts, feed tests <100ms.
- Prove the regression test catches the bug: with the tracked/shutdown wiring reverted (stash the afterEach change, keep the new test), the new test fails (first controller's feed gains the message); re-apply, watch it pass. Also confirm the previously failing five tests are affected directly by watching them flip from TLE (~8s) to fast.

## Verification steps

- One plain full-file run with default timeouts (the previously failing five tests must pass in well under 5s), repeated enough to be satisfied the failing env (uncompliant), plus `check-diff` clean.

## Out of scope

- Product behavior: the app never runs two controllers in one process, so no production code changes.
- The `spawnPty` auto-mock's stateless default (only matters when the file is run partially, an artifact of test filtering, not of normal runs).
- Temp-dir hygiene for other test files.

## Specs and docs

None — no user-visible behavior changes; `help.md` and `documentation/` need nothing.
