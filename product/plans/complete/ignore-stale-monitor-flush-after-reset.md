# Ignore a monitor flush success that settles after a reset

**Complexity: 2/10** — one generation guard added to 1 production file with ~1 added line, 4 requirements and 4 scenarios (p=3.76).

## Goal

A reporting-tab reset closes the owner tab's core role session and puts the monitor's first prompt back so the next flush primes a fresh context. The failed-result path already ignores a result that settles after that reset, but the success path does not: a successful reply from the discarded context still clears the re-primed first prompt, records the stale reply, and delivers a suggestion about work the reset threw away. The goal is to apply the same generation guard to the success path so a late successful reply is discarded, the fresh context keeps its primer, and the next flush carries that primer.

## Requirements

1. A successful flush result that settles after `resetContext` has advanced the monitor's generation is not applied to the current context. This is the issue text: "Ignore a monitor flush reply that settles after a reset instead of delivering a stale suggestion and dropping the re-primed first prompt."
2. A stale successful flush result delivers no suggestion. From the proposal: "compare the captured `generation` with `reg.resetGeneration` ... BEFORE any of `reg.firstPrompt = ''`, `recordReply`, `parseSuggestion` or `deliver`, returning early when they differ."
3. A stale successful flush result leaves the re-primed first prompt in place. From the spec: "A reply or error that arrives after its monitor was stopped, or after a reset began a fresh context, is ignored."
4. The first flush after a stale successful result has been ignored carries that primer. From the proposal: "assert ... the next flush carries that primer."
5. The existing failure-path generation suppression remains in place. From the proposal: "Leave the failure branch's existing suppression untouched."

## Design decisions

- Reuse the `generation` snapshot already captured at send time in `flush` and the `resetGeneration` counter that `reset` increments; no new state is introduced.
- Place the new guard in the answered (successful) path, after the `!result.answered` block and immediately before `reg.firstPrompt = ''`, so all four operations named by the proposal sit after it. This keeps both existing generation checks — the failed-result suppression and the rejection handler — byte-for-byte unchanged.
- Keep `isCurrent` and the clearing of `inFlight` ahead of the new guard, so a stopped monitor and a settled in-flight flag behave exactly as before regardless of generation.
- Treat a stale successful result as fully ignored: no primer clearing, no `recordReply`, no context growth, no suggestion delivery. This matches the spec's "delivers no suggestion" promise and needs no spec edit.

## Preserved behavior

1. A failed flush result that settles after `resetContext` writes no spurious "restarting monitor session" line and leaves the re-primed prompt for the next flush; the guard added here must not alter that. `src/monitor/manager.test.ts` ("a flush failure settled by resetContext writes no spurious monitor error line") pins it.
2. A flush result arriving after a monitor is stopped still delivers no suggestion and does not reopen the reporting tab; the new generation guard must not replace the `isCurrent` check. `src/monitor/manager.test.ts` ("a flush reply arriving after stop does not reopen the reporting tab") pins it.
3. A failed core prompt with a current generation still appends the error line, clears `inFlight`, and keeps monitoring; the new guard must not swallow current-generation failures. `src/monitor/manager.test.ts` ("a failed core prompt appends the error line, clears inFlight, and keeps monitoring") pins it.
4. A normal successful flush still clears the primer, records the reply, and delivers a parsed suggestion; the new guard must fire only on a generation mismatch. `src/monitor/manager.test.ts` ("external mode: delivers into the persona reporting tab colored after the target") pins it.

## Assumptions

1. `flush` snapshots `generation = reg.resetGeneration` at send time — `src/monitor/live-monitors.ts:116` (`const generation = reg.resetGeneration;`). This is the value to compare.
2. `reset` increments that counter, re-primes `firstPrompt`, and records the primer — `src/monitor/live-monitors.ts:92,96,97` (`reg.resetGeneration += 1;`, `reg.firstPrompt = monitorFirstPrompt(...)`, `recordContext(reg, reg.firstPrompt, 'input')`). A result sent before the increment therefore has a lower generation than the live one.
3. The success handler currently clears `firstPrompt`, records the reply, parses, and delivers with no generation check — `src/monitor/live-monitors.ts:120-129`. This is the unguarded path to fix.
4. The spec already promises a late reply after reset is ignored and delivers no suggestion — `product/specs/monitoring.md:88` ("A reply or error that arrives after ... a reset began a fresh context, is ignored ... delivers no suggestion"). No spec change is needed.
5. `manager.test.ts` drives flushes through a fake ACP whose `reply` settles the pending promise and whose `transcript`/reporting-tab feed expose the resulting context and suggestions — `src/monitor/manager.test.ts:71-85, 231-235, 293-304`. This is the harness for the new case.

## Existing functionality

1. The `generation` snapshot and `resetGeneration` counter — `src/monitor/live-monitors.ts:116,50` — already distinguish a prompt sent before a reset from the current context; the failed-result path uses them at line 123.
2. The `isCurrent` guard — `src/monitor/live-monitors.ts:76-78` — already suppresses results from monitors that were stopped while a prompt was pending.
3. `reset` — `src/monitor/live-monitors.ts:90-99` — already re-primes `firstPrompt` and records it, so ignoring the stale reply is enough to keep the primer for the next flush.
4. `recordContext` / `formatContext` — `src/monitor/context.ts:20-29` — provide the accumulator and text format that `MonitorManager.transcript` exposes for the snapshot assertion.
5. The `makeFakeAcp` / `harness` helpers and the existing reset tests in `src/monitor/manager.test.ts:53-134, 624-650` supply the settle-after-reset pattern the new test mirrors.

## Implementation steps

1. In `src/monitor/live-monitors.ts`, in the fulfilled-result callback of `flush`'s `promptResult(...).then(...)`, after the `if (!result.answered) { ... return; }` block and immediately before `reg.firstPrompt = ''`, add an early return when `generation !== reg.resetGeneration`. Do not move or edit the `isCurrent` check, the `reg.inFlight = false` assignment, the failed-result suppression, or the rejection handler.
2. Run `$janissary/scripts/run.mjs check-diff` and resolve any failures before moving on.

## UI design

None. The change discards a stale reply inside the monitor flush callback; it adds or changes no command, flag, key binding, or user interface. The visible effect is that a suggestion from a context the user already reset no longer appears in the owner transcript or the reporting feed, and the fresh context keeps its persona primer.

## Tests

1. Requirement 1, requirement 2, requirement 3, and requirement 4: in `src/monitor/manager.test.ts`, add a case that starts an external monitor, flushes one entry, calls `resetContext`, settles that first flush with a successful `[SUGGESTION]` reply, asserts the reporting feed has no suggestions and the context snapshot carries no stale reply, asserts the snapshot still contains the re-primed first prompt, then flushes a new entry and asserts the next prompt contains both the primer and the new entry. With the pre-fix behavior this fails on both the delivered suggestion and the missing primer on the next flush.
2. Requirement 5 / regression coverage: the existing `src/monitor/manager.test.ts` reset, stop, failed-prompt, and successful-delivery tests named in `Preserved behavior` must still pass; `$janissary/scripts/run.mjs check-diff` exercises them.

## Out of scope

- Editing `product/specs/monitoring.md`: it already promises that a late reply after reset is ignored and delivers no suggestion.
- Editing any help page or user/developer documentation: the recorded work item calls for none.
- Changing the pull request title or description, or touching any other backlog entry.
- Altering the failed-result or rejection-handler generation suppression, the `isCurrent` check, or the in-flight bookkeeping.
- Changing the `ask` path, monitor stop, or the reset mechanics themselves.

## Verification

`$janissary/scripts/run.mjs check-diff` first (lint, incremental typecheck, and the affected server tests, including all of `src/monitor/manager.test.ts`). Then read `src/monitor/live-monitors.ts` and confirm the fulfilled-result callback returns early on `generation !== reg.resetGeneration` before `reg.firstPrompt = ''`, `recordReply`, `parseSuggestion`, and `deliver`, and that both existing failure-path generation checks remain unchanged. Finally, in the running app, start a monitor against a busy target, click the reporting tab's reset button while a flush is outstanding, and let the old reply land: no suggestion from the discarded context may appear, and the next flush's prompt must still begin with the persona priming instructions.
