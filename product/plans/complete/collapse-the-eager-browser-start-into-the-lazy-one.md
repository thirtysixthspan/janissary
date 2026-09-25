# Collapse the eager browser start into the lazy one

**Complexity: 5/10** — one sequence instead of two, and the eager entry point becomes that sequence plus an explicit kick. The behavior does not change; the two suites that pinned the eager sequence's own ordering have to be re-pointed at the lazy builder and made async, and four of their assertions change because the ordering they pinned is the ordering that is going away.

## Summary

`startE2EBrowserServer` survives in full — its own session, its own guard wiring, its own spawn — but its only production caller is gone: `harnessSpawnEnv` and through it `RemoteProcesses.spawnPty` both reach the lazy builder now. What is left is a second implementation of the same acquisition sequence, kept alive by nothing but the two suites that test it. A fix to the guard options, the scratch allocation or the child's launch has to be written twice, and one written into only the uncalled copy leaves a suite passing against a path nothing runs.

## Design decisions

1. **The lazy builder is the only implementation.** Ports, the two path tokens, the guard, the teardown and the handle are one function. The eager entry point is that function plus one call, which is the entire difference between the two: ask for a browser now, or leave it to the first connect.

2. **The kick's failure is swallowed, and that is the honest contract.** `startE2EBrowserServer` is called from a caller that is part-way through building a tab, and a browser that would not start is a notification rather than a failed tab. The failure already reports through `onGone` and ends the client that asked; throwing it at the spawn would be a second, worse report of the same thing.

3. **The kick runs through `ensureUpstream`, so the two entry points share one start.** That means the eager start also waits for the browser to be listening before it counts as started, and that a start which fails consumes nothing — the same rule the lazy path has always had, now true of both.

4. **The suites are re-pointed, not rewritten.** `e2e-server-launch.test.ts` and `e2e-server-lifecycle.test.ts` keep every assertion about what a launch produces — the guard's options, the internal port and path, the child's argument vector, its environment, its profile, what a death reports — and become async around one helper that gets a browser up before a case runs. Four assertions change, each because the ordering they pinned was the eager ordering:

   - A launch failure no longer tears the guard down. Nothing acquired it, so there is nothing to roll back, and a tab whose first start failed still has an endpoint to serve a later connect against. The guard stays listening and the ports stay reserved.
   - A scratch allocation failure is reported after the guard is listening rather than before it starts, so the guard exists and stays up.
   - A guard that cannot listen now runs the same teardown a tab closing does, so the live browser's own directory is removed with it rather than kept.
   - A guard failure reports the guard's message alone. The child's last words live on the generation that is being released, and a guard that cannot listen is the tab's failure rather than the browser's; the browser's own account of a launch that did not come up still rides along, which is the case that matters and is unchanged.

5. **Both entry points are pinned from the harness's own call site.** `src/harness/scratch-dir.test.ts` is the one place that knows which builder production uses, so it is where "the lazy one, never the eager one" is worth asserting.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The sequence to keep | `startLazyE2EBrowserServer` | `src/browser/e2e-server.ts:146` |
| What a launch produces, asserted in detail | the launch and lifecycle suites | `src/browser/e2e-server-launch.test.ts`, `e2e-server-lifecycle.test.ts` |
| The one caller that chooses | `harnessSpawnEnv` | `src/harness/scratch-dir.ts:50` |

## Proposed changes

1. **`src/browser/e2e-server.ts`.** One internal builder takes the options and an optional kick; `startLazyE2EBrowserServer` is the builder alone and `startE2EBrowserServer` is the builder plus `void ensureUpstream(lazy).catch(...)`. The eager sequence's own session, guard and spawn block are deleted, and the module header and the two doc comments are rewritten to say what the file now is.

2. **`src/browser/e2e-server-test-fixture.ts`.** `start` becomes async: it calls the eager entry point and then awaits the guard's supplier, which is the kick, so a case begins with a browser running. A case that needs no browser — a full port band, a handle with nothing behind it — still works, because the helper only asks the guard when one was started.

3. **`src/browser/e2e-server-launch.test.ts`, `src/browser/e2e-server-lifecycle.test.ts`.** Every case awaits the helper; the four assertions above change; the case that pinned "returns synchronously, before the child can have started" is replaced by the one that says what the eager entry point is for.

4. **`src/harness/scratch-dir.test.ts`.** The module mock provides both entry points, and a case asserts the harness reaches for the lazy one and never the eager one.

## Tests

- `src/browser/e2e-server-launch.test.ts`, `src/browser/e2e-server-lifecycle.test.ts`: re-pointed as above. The launch suite keeps its 25 cases and the lifecycle suite its 30, with the four changed expectations named in decision 4.
- `src/harness/scratch-dir.test.ts`: one new case pinning the builder production uses.
- `src/browser/e2e-server-lazy.test.ts` and `src/browser/e2e-guard.test.ts` are untouched and must keep passing: the lazy path is what nothing about this change may disturb.

## Out of scope

- No change to the guard, the ports, the scratch rule, what a death reports, or the environment a launch hands back.
- No change to `harnessSpawnEnv` or to the remote call site.
- No removal of the eager entry point itself: it is exported, and its doc comment now says what it is for.

## Verification

`./scripts/run.mjs check-diff`, then confirm `src/browser/e2e-server.ts` has one `allocateBrowserScratch`, one `startE2EGuard` and one `spawnBrowserChild` call in it.
