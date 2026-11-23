# Clear a monitor's recorded core session identity on reporting-tab reset

**Complexity: 2/10** — one line in 1 production file with no new units, 5 requirements and 7 scenarios (p=4.06); the guard and all other reset mechanics stay untouched.

## Goal

A reporting-tab reset closes the owner tab's core role session and re-primes the monitor's first prompt, but the monitor keeps the identity of the core session that answered its last flush. The next flush therefore primes a genuinely new session, and when that reply arrives the rotation guard mistakes the expected identity change for another surface's close-and-reopen: it discards the reply, re-primes a second time, and delivers no suggestion. The goal is to clear the recorded identity on the reset path so the first flush on the fresh session records the new identity and delivers its suggestion, without weakening the real rotation guard.

## Requirements

1. On a reporting-tab reset, clear the `MonitorSub` field that records the last answering core-session identity. From the entry: "clear the MonitorSub field that records the last answering core-session identity alongside the existing first-prompt re-prime".
2. The first answered flush after a reset seeds the new identity instead of comparing against the discarded one. From the entry: "so the next answered flush seeds the new identity instead of comparing against the discarded one."
3. The first answered flush after a reset delivers a parsed suggestion from its reply. From the entry: "assert a new suggestion is delivered".
4. The first answered flush after a reset records its reply in the context snapshot. From the entry: "assert ... the reply appears in the context snapshot".
5. Leave the reset-generation, is-current, in-flight handling and the rotation guard itself otherwise untouched. From the entry: "Leave the reset-generation, is-current, in-flight handling and the rotation guard itself otherwise untouched."

## Design decisions

- The recorded identity is the existing optional `coreSession` field on `MonitorSub`; no new state, field, or API change is introduced.
- Clear it in `LiveMonitors.reset` immediately alongside the existing `reg.firstPrompt = monitorFirstPrompt(reg.persona, reg.delimiter)` re-prime, leaving the `resetGeneration` increment, `isCurrent` check, `acp.close` call, and the re-primed context write where they are.
- With no recorded identity, the rotation guard's `reg.coreSession !== undefined` test is false on the first answered post-reset result, so the reply falls through to the normal clear-record-parse-deliver path. That single state change is the whole fix.
- Do not change the guard condition or adopt a sentinel value: a genuine rotation with no reset still has a recorded identity and is still caught by the same guard.
- No functional spec edit is needed: `product/specs/monitoring.md` already promises that a reset closes the core session and that "the next flush re-sends its first prompt on a fresh session, on demand".

## Preserved behavior

1. A genuine shared-core-session rotation without a reset still discards the replaced session's reply and re-primes the following flush; the rotation guard must stay. `src/monitor/manager.test.ts` ("re-primes the next flush after another surface closes the shared core session") pins it.
2. A successful reply sent before a reset but settling after it is still ignored by the generation guard and leaves the primer intact; clearing the identity must not bypass that guard. `src/monitor/manager.test.ts` ("a flush reply arriving after resetContext is ignored and the next flush keeps the primer") pins it.
3. A failed flush settling after a reset still writes no spurious monitor error line and keeps the re-primed prompt. `src/monitor/manager.test.ts` ("a flush failure settled by resetContext writes no spurious monitor error line") pins it.
4. A flush error arriving after a monitor is stopped still adds no monitor error line and leaves no monitor running; the `isCurrent` check stays first. `src/monitor/manager.test.ts` ("a flush error arriving after stop does not add a monitor error line") pins it.
5. A core refusal still settles the busy prompt and re-sends the primer on the next batch. `src/monitor/manager.test.ts` ("a core refusal settles the old prompt and the next batch sends the persona primer again") pins it.
6. A normal successful flush on an unchanged session still clears the primer and delivers its parsed suggestion; the clear-on-reset must not affect other flushes. `src/monitor/manager.test.ts` ("external mode: delivers into the persona reporting tab colored after the target") pins it.

## Assumptions

1. `coreSession` is the `MonitorSub` field recording the last answering core-session identity — `src/monitor/live-monitors.ts:47-50` (`coreSession?: string`).
2. The rotation guard skips `recordReply`, `parseSuggestion` and `deliver` when a recorded identity exists and differs — `src/monitor/live-monitors.ts:131-135` (`if (reg.coreSession !== undefined && reg.coreSession !== result.session) { ... return; }`).
3. `reset` currently re-primes `firstPrompt` without clearing the recorded identity — `src/monitor/live-monitors.ts:94-103`.
4. An answered ACP result carries its session identity as a required string — `src/acp/types.ts:29-30` (`{ answered: true; reply: string; session: string; recordId?: string }`).
5. The fake ACP can settle a prompt with an explicit identity, and the reporting feed and `transcript` expose suggestions and context — `src/monitor/manager.test.ts:83, 293-305` (`replyWithSession`, `monitor.transcript`).
6. The spec already promises the reset's next flush primes a fresh session — `product/specs/monitoring.md:21` ("the next flush re-sends its first prompt on a fresh session, on demand"). No spec change is needed.

## Existing functionality

1. The `coreSession` field — `src/monitor/live-monitors.ts:50` — holds the identity the reset must clear.
2. `LiveMonitors.reset` — `src/monitor/live-monitors.ts:94-103` — already increments the generation, closes the core session, re-primes `firstPrompt`, and records the primer; the clear joins that sequence.
3. The rotation guard — `src/monitor/live-monitors.ts:131-135` — already adopts a changed identity and re-primes; it needs no edit once the field is cleared.
4. `recordReply` and `formatContext` — `src/monitor/reply.ts:10-12`, `src/monitor/context.ts:20-29` — provide the context snapshot the new test asserts against.
5. The `makeFakeAcp` / `harness` helpers and the two-identity rotation test — `src/monitor/manager.test.ts:53-134, 672-696` — supply the explicit-session settle pattern the new test mirrors.

## Implementation steps

1. In `src/monitor/live-monitors.ts`, in `LiveMonitors.reset`, clear `reg.coreSession` next to the existing `reg.firstPrompt = monitorFirstPrompt(reg.persona, reg.delimiter)` re-prime. Do not move or edit the `isCurrent` check, the `resetGeneration` increment, the `acp.close` call, the `inFlight` handling, the context writes, or the rotation guard in `flush`.
2. Run `$janissary/scripts/run.mjs check-diff` and resolve any failures before moving on.

## UI design

None. The change runs inside the reporting-tab reset path and adds no command, flag, key binding or interface element. The visible effect is that the first flush after a reset delivers its suggestion and shows its reply in the context snapshot instead of being silently dropped and requiring a second target change.

## Tests

1. Requirements 1-4: in `src/monitor/manager.test.ts`, add a case that starts an external monitor, emits one target entry, flushes, and settles that flush with an explicit session identity through `replyWithSession`. Call `resetContext`, emit a fresh target entry, flush, and settle that flush with a second, different identity. Assert a new suggestion carrying the second reply text is delivered to the reporting tab feed and that `monitor.transcript('assistant')` contains that reply. With the pre-fix behavior no second suggestion is delivered and the second reply is absent from the context snapshot.
2. Requirement 5 / regression coverage: the existing reset, stop, refusal, failed-flush and rotation cases named in `Preserved behavior` must still pass; `$janissary/scripts/run.mjs check-diff` exercises them.

## Out of scope

- Spec edits: `product/specs/monitoring.md` already describes the reset and fresh-session re-prime promise; this is an internal state bug.
- Help pages and user/developer documentation: the recorded work item calls for none.
- Changing the `resetGeneration`, `isCurrent`, `inFlight` or refusal handling, the rotation guard itself, or the `ask` path.
- Touching the other pull-request backlog entry or the pull request title and description.

## Verification

`$janissary/scripts/run.mjs check-diff` first (lint, incremental typecheck, and the affected server tests including all of `src/monitor/manager.test.ts`). Then read `src/monitor/live-monitors.ts` and confirm `reset` clears `reg.coreSession` alongside the first-prompt re-prime while the generation increment, `isCurrent` check, in-flight handling, context writes and the `flush` rotation guard remain unchanged. Finally, in the running app, start a monitor, let it deliver one suggestion, click the reporting tab's reset button, then change the target so a new flush runs: the first post-reset flush must deliver a suggestion and its reply must appear when the context snapshot is opened. Separately, close the core session from the connections panel without resetting and confirm the guard still discards exactly that one replaced-session reply.
