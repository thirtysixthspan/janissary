# Count a launch that times out before listening against the restart budget

**Complexity: 4/10** — one field replaced in one record, a two-branch change to how a dead generation is judged, and a fixture flag so the timeout can be driven under fake timers. The care is in keeping both existing budget cases green, since they are the other side of the same line.

## Summary

`noteFailure` resets the restart budget for any dead generation whose `spawnedAt` is thirty seconds or more in the past. `waitForListening` only gives up after thirty seconds. So every launch that hangs until the probe's bound is judged a browser that ran, and the count goes back to zero. The harness spec says a start that ends in a failure counts against the tab. A Chromium that hangs at launch every time turns a retrying script into an unbounded loop of spawned children, kept scratch directories, log files and notifications, one per thirty seconds, which is exactly what the budget was added to stop.

## Design decisions

1. **Judge uptime from when the browser was listening, not when it was spawned.** `LazyBrowser.spawnedAt` becomes `listeningAt`, stamped in `startBrowser` once `waitForListening` resolves and cleared to `undefined` when a start begins. A browser is only "one that ran" if it came up. The time it spent failing to come up says nothing about whether it was used.

2. **A generation that never listened always counts.** `noteFailure` resets the count only when `listeningAt` is set and at least `UPTIME_RESET` has passed since it. Every other dead generation, whether its spawn threw, it exited during the wait, or the wait ran out, increments the count.

3. **The accepted trade-off stays.** A browser that listens and then crashes just over thirty seconds later, every time, still resets the count. That was the original plan's trade-off, and each of those deaths is still reported on the notifications tab.

## Proposed changes

1. **`src/browser/e2e-server.ts`.** Replace `spawnedAt: number` with `listeningAt: number | undefined` on `LazyBrowser`, initialized to `undefined`. `startBrowser` clears it before acquiring anything and stamps `Date.now()` after `waitForListening` resolves. `noteFailure` resets `failures` only for a generation that reached listening at least `UPTIME_RESET` ago. The `failures` and field comments say what the stamp now means.

2. **`product/specs/harness.md`.** In the restart paragraph, "a browser that dies within thirty seconds of being asked for" becomes "within thirty seconds of coming up", and the list of failed starts gains a launch that never started listening in time.

3. **`ai/guidelines/sandbox-e2e-browser.md`.** "died seconds after being asked for" becomes "died within seconds of coming up", so the agent-facing account matches the rule.

## Tests

- `src/browser/e2e-server-test-fixture.ts`: a `probeTimesOut` flag, reset to `false` with the rest of the fixture, makes the mocked `waitForListening` reject with `e2e browser did not start listening in time` after thirty seconds, the real probe's bound.
- `src/browser/e2e-server-lazy.test.ts`: with fake timers, three connects whose launches each time out after thirty seconds are followed by a fourth connect refused with `e2e browser will not be restarted`, with three spawns. Under the old spawn-time rule this case fails, because each timed-out generation was thirty seconds old when judged.
- "forgets a failure once a generation has been up long enough to have been used" and "counts a browser that dies the moment it is asked for" keep passing unchanged. In both, the stub child is listening from the fork, so listening time and spawn time coincide.

## Out of scope

- No change to the limit, the interval, the probe's bound, or the refusal and its report.
- No change to how a death is reported.

## Verification

`./scripts/run.mjs check-diff`.
