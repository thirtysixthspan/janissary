# Let a `-b` tab restart its browser a hundred times

**Complexity: 2/10** — one constant, the five tests that pin it from both sides, and three places of prose that state the number. The budget's shape, the accounting, the refusal and the one-time report are all unchanged; only the threshold moves.

## Summary

A `-b` tab is given no further browser after three starts in a row that ended in a failure. Three is low enough to be spent by ordinary flakiness on a busy machine: a tab whose Chromium lost four races for a port in a row is refused a browser for the rest of its life, and the agent inside it is told there is nothing left to retry. The issue is to allow as many as 100 restarts, so a tab survives a long bad patch instead of being closed out after a handful of unlucky launches.

## Design decisions

1. **The number moves; nothing else does.** `RESTART_LIMIT` (`src/browser/e2e-server.ts:153`) is the only limit in the codebase, and `ensureUpstream` (`:232`) is its only reader. The accounting — what counts as a failure, the thirty-second uptime reset, the refusal that spends nothing, the report that is said once — is already the right shape at any threshold, and is left exactly as it is.

2. **A hundred, not a thousand, and not unlimited.** The budget exists to stop a script that retries its connect from spawning a Chromium, a scratch directory and a log file per attempt forever. A hundred failures in a row is far past anything ordinary flakiness produces — a tab that has failed a hundred launches will not succeed on the hundred-and-first, so nothing real is refused — while a loop still ends in a bounded number of spawns, and the ports, the guard and the tab carry on afterwards exactly as before.

3. **The threshold is exported so the tests read it rather than restate it.** The five cases in `src/browser/e2e-server-lazy.test.ts` that walk to the threshold walk it because of what happens at the threshold: the refusal spends nothing, the report is said once, a long-lived generation resets the count. Repeating `3` in five loops meant the number was written twice, in the source and in every test, and the tests would have silently stopped describing the code the moment one of them moved. They now import `RESTART_LIMIT`.

4. **One test still pins the number itself.** Everything above would pass at any threshold, which is right for the mechanism and wrong for the issue: "a hundred" is the behavior being asked for, so one case walks a hundred failing connects and asserts the hundred-and-first is the refusal. That is the only place `100` appears as a literal in the tests.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The budget, and the check that spends it | `RESTART_LIMIT`, `lazy.failures` | `src/browser/e2e-server.ts:153`, `:232` |
| The phrase a spent budget is refused with | `WILL_NOT_RESTART` | `src/browser/e2e-refusal.ts:9` |
| A walk to the threshold in tests, with the refusal on the far side | the `will not stay up` block | `src/browser/e2e-server-lazy.test.ts:146` |

## Proposed changes

1. **`src/browser/e2e-server.ts`.** `RESTART_LIMIT` becomes 100 and is exported. The comment above it gains why that number: the budget is a bound, not a tolerance, and it is set far above anything a real tab meets so that a bad patch on the host costs a tab its browser only when the browser is genuinely never going to start.

2. **`src/browser/e2e-server-lazy.test.ts`.** Every threshold-dependent loop and count reads `RESTART_LIMIT`; the six cases in `startLazyE2EBrowserServer when a browser will not stay up` are otherwise untouched. One new case walks a hundred failing connects and asserts the refusal, and with it that nothing was spent past the budget.

3. **`product/specs/harness.md`.** The e2e section states the limit; the number becomes a hundred, and the sentence says plainly that the bound is set far above ordinary flakiness, so a tab is not refused a browser for a bad run of launches.

4. **`ai/guidelines/sandbox-e2e-browser.md`.** "When it stops working" tells an agent that a tab refused with the phrase has had three browsers in a row and will not be given a fourth. That number is the same fact the spec states, it goes in the answer the agent reads when its own script is being refused, and the plan behind the original budget (`product/plans/complete/bound-connect-triggered-browser-restarts.md`) already listed this file as one of the three updated alongside the constant. It becomes a hundred, with the advice unchanged: say so in your report rather than looping.

## Tests

In `src/browser/e2e-server-lazy.test.ts`, all in `startLazyE2EBrowserServer when a browser will not stay up`:

- A hundred connects that each fail the same way, then the refusal: the hundred-and-first connect is closed with the refusal, nothing further is spawned or allocated, the guard is still listening, and `onGone` has said the refusal once and only once.
- The four existing cases that walk to the threshold — a child that dies the moment it is asked for, a long-lived generation that resets the count, a launch that times out, a refusal that reaches the client as an `E2EClientRefusal`, and the report said once however many connects follow — keep their assertions and now walk `RESTART_LIMIT` failures instead of three. They are the proof that raising the threshold changed the number and nothing else.

## Out of scope

- No backoff and no delay between restarts. The budget is a count; a hundred restarts happen as fast as the connects arrive.
- No change to what counts as a failure or to the thirty-second uptime reset.
- No change to the refusal, the phrase, the one-time report, the guard, the ports, or the scratch-directory rule.
- No configuration setting. The number is a constant in one place, as it is today.
- No change to `help.md` or `documentation/user-documentation/`: neither states the limit, and the two pages that describe a `-b` tab's browser already describe restarts as unremarkable.

## Verification

`./scripts/run.mjs check-diff`.
