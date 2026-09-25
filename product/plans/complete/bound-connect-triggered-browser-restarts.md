# Bound connect-triggered browser restarts and their death reports

**Complexity: 6/10** — a counter, two constants and a refusal in one file, plus the tests that pin the threshold from both sides. The one thing that needs care is *when* a generation's death is judged: nothing watches a live child, and a budget judged at the wrong moment either refuses a browser that ran for an hour or lets a loop run for a minute.

## Summary

Every lazy generation is its own session carrying the tab's `onGone`, so a launch that fails the same way every time, or a browser that crashes each time it comes up, spawns a fresh child and delivers a full death report — a notification, a log file, a rewritten band, a kept scratch directory — on every connect, with nothing to stop it. Where a death used to be final, a retrying Playwright script or a confined agent that can crash its own browser becomes an unbounded stream of Chromium spawns and host directories outside the sandbox.

## Design decisions

1. **A death is judged when the next one is asked for, not when it happens.** Nothing in this path watches a live child — `spawnBrowserChild` owns the exit handler and the test stub's child cannot take a second listener on the same event — and a client asking again is the only moment a dead generation is noticed anyway. So the count is taken at the top of `ensureUpstream`, from the generation sitting behind the guard: found dead, it is either a start that did not take or a browser that has been used.

2. **A generation that outlived the interval resets the count.** This is what tells a browser that genuinely keeps failing from one that crashed once after an hour of use, and it is why the judgement can afford to be approximate: a loop crashes the browser seconds after each spawn, so every one of those checks finds a young generation, while a single crash found late is treated as a browser that ran. A threshold set too tight would refuse a legitimate second browser; resetting on a long life is the generous side of that line.

3. **The refusal spends nothing and reports once.** Past the budget, `ensureUpstream` rejects with a fixed phrase without allocating a scratch or spawning a child, and the tab session delivers one last report saying the browser has stopped being restarted. The guard keeps listening, the ports stay reserved, and `handle.close()` releases everything as it always has — so a tab whose browser will not start is still a tab the user can read, close, and get a band on.

4. **One failure is still free.** A tab whose first connect fails has spent nothing but a count of one, well under the budget, which is what design decision 6 of the plan behind this pull request promises: a failed first connect does not close the door.

5. **The report is delivered through `onGone` directly, once.** `stopSession` is the one place a report is composed and a resource released, and neither is wanted here — nothing is being released. The once-ness that `stopSession` would have provided is a flag on the tab's own record, and the phrase carries no child output because the last failed generation's output was already reported with that generation.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| A death already reported exactly once, with the child's output | `stopSession` | `src/browser/e2e-session.ts:86` |
| A live generation distinguished from a dead one | `generation.closed` | `src/browser/e2e-server.ts` |
| The phrase vocabulary the agent already reads | the close reasons | `src/browser/e2e-guard.ts` |

## Proposed changes

1. **`src/browser/e2e-server.ts`.** `LazyBrowser` gains `failures`, `reported` and `spawnedAt`; two constants give the limit and the interval; `noteFailure` counts a dead generation at the top of `ensureUpstream` and clears the record it judged; the budget check refuses with `e2e browser will not be restarted` and reports once. `startBrowser` stamps `spawnedAt` when it begins. The doc comments on `E2EBrowserOptions.onGone` and on `E2EBrowserHandle.close` are corrected: `onGone` fires once per browser and once more when restarts stop, and a close after a death is no longer a no-op for the lazy start, because it closes the guard and gives the ports back.

2. **`product/specs/harness.md`.** The e2e section states the limit: three starts in a row ending in a failure, then the next connect is refused with a reason, one last report says the browser has stopped being restarted, and the tab keeps running with its endpoint.

3. **`ai/guidelines/sandbox-e2e-browser.md`.** "When it stops working" stops promising that a later connect always starts a fresh browser, and says what an agent sees instead: the refusal, its phrase, and that a report is on the human's notifications tab.

## Tests

In `src/browser/e2e-server-lazy.test.ts`:

- A spawn that throws on every call: the first three connects each reject with the spawn failure and spawn a child; the fourth rejects with the refusal without calling `spawn` or `allocateBrowserScratch`, `onGone` has been called the limit plus one times, the last of them the refusal, and the guard is still listening.
- A child that exits immediately on every generation: three generations, then the refusal, with three spawns.
- With fake timers, a generation advanced past the interval before it dies: the count resets, so three further failures are still tolerated and the fourth connect is the one refused.
- "consumes nothing, so the next connect starts a browser" and "reports the replacement dying as its own death, not as silence" are unchanged and must keep passing: both stay under the budget.

## Out of scope

- No backoff. The budget is a count, not a delay, so a loop stops rather than slowing.
- No change to `reportBrowserGone`, to the `browser-exited` frame, or to what a report contains. They receive fewer calls.
- No change to the guard, the ports, or the scratch rule.

## Verification

`./scripts/run.mjs check-diff`.
