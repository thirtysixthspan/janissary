# Suppress the spurious monitor error line when a reset closes an in-flight flush

**Complexity: 3/10** — ~10 added lines across 2 production files and 6 behavioral requirements, with no new modules (p=4.60)

## Goal

Clicking a reporting tab's reset button intentionally closes the monitor's core role session. When a flush is still in flight, that close settles the pending prompt with an `ACP session closed.` failure, which the flush currently reports as `monitor <name>: ACP session closed. — restarting monitor session` on the owner transcript. That line claims the monitor died and restarted when the user simply reset it, training them to distrust the error line that genuine refusals depend on. The fix scopes a reset-generation guard to the flush path so the settlement caused by a reset is silent while real failures still surface.

## Requirements

1. `MonitorSub` carries a reset-generation counter, quoted from the entry: "give `MonitorSub` a small reset-generation counter (or an equivalent one-shot flag)".
2. `reset` increments the generation before closing the core session, quoted from the entry: "that `reset` increments before calling `managers.acp.close`".
3. Each `flush` captures the generation at send time, quoted from the entry: "have the `flush` `promptResult().then` handlers capture the generation they started with".
4. A failed result whose generation no longer matches still releases the in-flight slot, quoted from the entry: "still clears `inFlight`".
5. A failed result whose generation no longer matches is not surfaced, quoted from the entry: "but skips `promptFailed` and its transcript append and rate-limit notification".
6. A regression test covers the reset-with-in-flight-flush case, quoted from the entry: "asserts that no `restarting monitor session` line was appended while `inFlight` was released and the next flush re-sends the persona primer".

## Design decisions

- A numeric generation counter is used rather than a boolean one-shot flag, because a monitor can be reset repeatedly while it runs; each in-flight flush captures the value at send time and compares it on settlement.
- `inFlight` is cleared before the generation check in both settlement branches, so a stale result can never wedge the monitor even though its error is suppressed.
- The guard sits in the two failure branches of `flush` only — the fulfilled-but-not-answered branch and the rejected branch — because a reset closes the core session and settles its in-flight prompt as a failure. The successful-answer branch is left as it is (linked to Requirement 5).
- The existing `isCurrent` check stays first in both handlers, so results from a stopped monitor remain ignored before any generation logic runs (linked to Assumption 2).
- `askMonitor` in `src/monitor/ask.ts` is not changed: its post-reset error reporting is explicitly outside this entry's scope, and the existing ask tests pin that behavior (linked to Assumption 5).

## Preserved behavior

1. A genuine core refusal from a flush still appends the monitor error line and re-primes the next prompt; that line must not disappear when the generation is unchanged — `a core refusal settles the old prompt and the next batch sends the persona primer again` in `src/monitor/manager.test.ts`.
2. A rate-limit-shaped flush failure still fires the `rate-limited` notification when the generation is unchanged — `a flush error with a rate-limit-shaped message fires a rate-limited notification` in `src/monitor/manager.test.ts`.
3. `askMonitor` still finishes the owner's running entry with the monitor error line on a core refusal; that text and the rate-limit notification must not be removed — `uses the monitor error line for a core refusal without respawning anything` in `src/monitor/ask.test.ts`.
4. `resetContext` still closes each feeding monitor's core role session and re-primes the next prompt; it must not stop closing the session or stop regenerating `firstPrompt` — `resetContext closes the core session and re-primes the next prompt` in `src/monitor/manager.test.ts`.

## Assumptions

1. `src/monitor/live-monitors.ts:87-95` (`protected reset(reg: MonitorSub): void`) closes the owner's core role session and regenerates `firstPrompt`; the increment belongs before the `managers.acp.close` call on line 89.
2. `src/monitor/live-monitors.ts:113-131` (`void this.managers.acp.promptResult(...).then(...)`) registers two handlers that both clear `inFlight` and call `promptFailed`; both need the same generation guard.
3. `src/monitor/manager.ts:60-65` (`const setup: MonitorSubSetup`) is the only production construction of a monitor record, so the new required field must be initialized to `0` there (`src/monitor/live-monitors.ts:58`, `MonitorSubSetup = Omit<MonitorSub, 'timer'>`).
4. `src/monitor/manager.test.ts:71-85` (`function makeFakeAcp`) exposes a `fail` helper that settles a pending call with `{ answered: false, error }`, which is how the reset settlement is simulated in the new test.
5. `src/monitor/ask.ts:15-45` (`export function askMonitor`) owns a separate settlement path with its own error line, so it need not read the new field.
6. `product/specs/monitoring.md:86` already states that a result arriving "after its session was replaced by a reset ... is ignored ... writes no 'restarting monitor session' line", so the delegated instruction to make no spec, help, or documentation edits leaves the behavior spec accurate.

## Existing functionality

1. `isCurrent` rejects late results from monitors that were stopped or replaced — `src/monitor/live-monitors.ts:73-75` (`protected isCurrent(reg: MonitorSub): boolean`).
2. `promptFailed` appends the monitor error line and raises the rate-limit notification in one place — `src/monitor/live-monitors.ts:79-82` (`private promptFailed(reg: MonitorSub, message: string): void`).
3. `monitorFirstPrompt` rebuilds the persona primer that `reset` installs — `src/monitor/session.ts:9-11` (`export function monitorFirstPrompt`).
4. The fake ACP's `fail` helper settles a held prompt with a refusal — `src/monitor/manager.test.ts:83` (`fail: (index: number, error: string) => settleWith(...)`).

## Implementation steps

1. In `src/monitor/live-monitors.ts`, add a required `resetGeneration: number` field to `MonitorSub` with a short comment explaining that a flush captures it to recognize a settlement caused by a reset. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/monitor/manager.ts`, initialize `resetGeneration: 0` in the `MonitorSubSetup` object in `start` so every new monitor begins at generation zero. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/monitor/live-monitors.ts`, change `reset` to increment `reg.resetGeneration` before the `managers.acp.close` call, leaving the close, context reset, `firstPrompt` regeneration and metadata update in place. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `src/monitor/live-monitors.ts`, capture the current generation in `flush` next to `reg.inFlight = true`, and in both settlement branches clear `inFlight` then call `promptFailed` only when the captured generation still equals `reg.resetGeneration`; leave the successful-answer branch untouched. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Add `resetGeneration: 0` to the record fixtures in `src/monitor/stop.test.ts` and `src/monitor/info.test.ts` so they still satisfy the widened `MonitorSub` type; their assertions and behavior are unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No UI is added or changed. The reporting tab's existing reset button keeps its look and behavior; only a false error line on the owner transcript is removed.
2. No new badge, colour, key binding, or accessible name is introduced, so `help/` pages are untouched.

## Tests

1. Requirement 6: add one test to `src/monitor/manager.test.ts` that starts an external monitor, emits a target entry, advances the flush timer to leave the core call pending, calls `resetContext`, settles that pending call with `ACP session closed.`, asserts that no appended entry contains `restarting monitor session`, emits a second entry, advances the timer, and asserts the next prompt contains both the `[SUGGESTION]` primer and the second entry — the latter proving the in-flight slot was released.
2. Requirements 1 to 5: the existing reset, core-refusal, rate-limit and ask tests listed in Preserved behavior must pass unedited, confirming the guard is scoped to stale generations only.

## Out of scope

- Changing `src/monitor/ask.ts` or any ask test's assertions.
- Spec, help page, user-documentation and developer-documentation edits; the delegated work item forbids them, and `product/specs/monitoring.md:86` already describes the intended behavior.
- A PR description correction, a title change, or any AI attribution in code, tests, plans, or the commit.
- New modules, new services, or a change to the 30-second flush cadence.

## Verification

End with `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck and the monitor tests are green.

Manual check against the running app: start an external monitor with a shipped persona watching a busy tab, and while its flush prompt is outstanding click the reporting tab's reset button. Confirm the owner tab's transcript gains no `monitor <name>: ACP session closed. — restarting monitor session` line, that the core role connection is re-established once, and that a later target change still produces a suggestion from the re-primed session. A failure looks like the false error line appearing at the moment of reset, or the monitor never producing another suggestion.
