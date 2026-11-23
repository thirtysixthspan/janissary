# Re-prime a monitor persona when its shared core session is replaced

**Complexity: 3/10** — ~9 added lines in 1 production file, 7 requirements and 6 test scenarios (p=4.557); no new modules.

## Goal

A monitor sends its persona instructions once: the first flush carries `monitorFirstPrompt`, and its answered result clears `firstPrompt` so later flushes carry only framed batches. The monitor drives the owner tab's **shared** core role session, which another surface can close and reopen — `connections close acp:<role>:<model>` on the terminal, or the core row's close control on the connections tab. After that rotation the monitor keeps flushing into a fresh session that never received the persona body, the `[SUGGESTION]` reply format, or the trust-framing instructions, so its suggestions stop parsing and monitored content arrives without the instruction-hierarchy framing. The goal is to detect the rotation from the answered result's session identity, discard that one reply, and re-prime the new session on the next flush.

## Requirements

1. Add a field to `MonitorSub` that records the core session identity from an answered `promptResult`. From the entry: "add a field to `MonitorSub` that records the core session identity from an answered `promptResult`".
2. Seed that recorded identity on the first answered flush result. From the entry: "Seed the recorded identity on the first answered result".
3. Compare the returned identity with the recorded one on each later answered flush result. From the entry: "on each later answered flush result compare the returned identity with the recorded one".
4. When the identities differ, deliver no reply from the replaced session. From the entry: "skip `recordReply`, `parseSuggestion` and `deliver`".
5. When the identities differ, restore the persona primer so the next flush re-primes the new session. From the entry: "restore `reg.firstPrompt = monitorFirstPrompt(reg.persona, reg.delimiter)`, and let the next flush re-prime the new session".
6. Adopt the new identity when the rotation is detected so the following flush's result matches. Implied by requirement 5: a monitor that kept the old identity would re-prime on every later result and would never deliver again.
7. Leave the existing reset-generation, `isCurrent` and `inFlight` handling unchanged. From the entry: "Leave the `resetGeneration`, `isCurrent` and `inFlight` handling untouched."

## Design decisions

- Keep the recorded identity optional on `MonitorSub` — it has no value until the first answered result. `MonitorSubSetup` is `Omit<MonitorSub, 'timer'>`, so an optional field keeps `MonitorManager.start`'s setup literal unchanged and confines the production edit to `live-monitors.ts`.
- Place the comparison in the fulfilled-result callback of `flush`'s `promptResult(...).then(...)`, after the existing `generation !== reg.resetGeneration` guard and immediately before `reg.firstPrompt = ''`, so every operation on the answered path sits after it.
- Compare first, then assign: the mismatch branch adopts `result.session` as the new recorded identity before returning. That adoption is what lets the re-primed flush settle normally instead of looping on the mismatch forever (requirement 6).
- A mismatched result is fully ignored except for re-priming: no reply is recorded, no suggestion parsed, no delivery, and no new context entry. The frame batch that prompted it has already been consumed and is deliberately not replayed.
- Do not infer rotation from `acp.close` calls: the monitor does not observe other surfaces' closes, and `result.session` is the authoritative identity of the session that actually answered.

## Preserved behavior

1. A successful flush on an unchanged session still clears the primer, records the reply, and delivers a parsed suggestion; the new identity check must fire only on a genuine mismatch. `src/monitor/manager.test.ts` ("external mode: delivers into the persona reporting tab colored after the target") pins it.
2. A successful reply arriving after `resetContext` still delivers no suggestion and leaves the re-primed primer in place; the new check must not replace the generation guard. `src/monitor/manager.test.ts` ("a flush reply arriving after resetContext is ignored and the next flush keeps the primer") pins it.
3. A reply arriving after a monitor is stopped still delivers nothing and does not reopen the reporting tab; the `isCurrent` check stays first. `src/monitor/manager.test.ts` ("a flush reply arriving after stop does not reopen the reporting tab") pins it.
4. A failed flush still appends the monitor error line, clears `inFlight`, and keeps monitoring; the answered-only identity check must not touch that branch. `src/monitor/manager.test.ts` ("a failed core prompt appends the error line, clears inFlight, and keeps monitoring") pins it.
5. A core refusal settles the busy prompt and the next batch re-sends the primer; the new branch must stay inside the answered path. `src/monitor/manager.test.ts` ("a core refusal settles the old prompt and the next batch sends the persona primer again") pins it.

## Assumptions

1. An answered ACP result carries the answering session's identity as a required string — `src/acp/types.ts:29-31` (`{ answered: true; reply: string; session: string; recordId?: string }`). No API change is needed.
2. That identity is the per-role core session identity from `AcpManager.sessionIdentity` — `src/acp/manager.ts:149` (`this.sessionIdentity(label, attempt.role) ?? ''`) — so a close and reopen of the core session produces a different value.
3. `flush` already clears `firstPrompt` and calls `recordReply`, `parseSuggestion`, and `deliver` only on an answered result — `src/monitor/live-monitors.ts:122-130`. This is the path to extend.
4. `monitorFirstPrompt` is the single source of the persona body, reply format and trust framing — `src/monitor/session.ts:9-10` (`[persona.body, SUGGESTION_FORMAT, TRUST_FRAMING_INSTRUCTIONS(delimiter)].join('\n\n')`). Restoring it is enough to re-prime.
5. `makeFakeAcp` lets a test settle each captured prompt with an explicit result, and `close` records a core close — `src/monitor/manager.test.ts:53-86`. The new case can drive two identities without changing production code.

## Existing functionality

1. `monitorFirstPrompt` — `src/monitor/session.ts:9` — builds the primer the re-primed flush must carry; `reset` already uses it at `src/monitor/live-monitors.ts:96`.
2. The `generation` snapshot and `resetGeneration` counter — `src/monitor/live-monitors.ts:50,116,126` — keep reset-time results out of the answer path; the new check is placed after that guard.
3. `isCurrent` and the `inFlight` bookkeeping — `src/monitor/live-monitors.ts:76-78,120-121` — already suppress stopped-monitor results and free the prompt slot; both stay untouched.
4. `recordReply`, `parseSuggestion` and `deliver` — `src/monitor/live-monitors.ts:128-130` — are the three operations the mismatch branch must skip.
5. The fake ACP and `harness` helpers — `src/monitor/manager.test.ts:53-134` — supply the prompt capture, explicit settle, close recording, reporting-tab feed and context transcript the new test asserts against.

## Implementation steps

1. In `src/monitor/live-monitors.ts`, add an optional `coreSession` field to `MonitorSub`, documented as the identity of the core session that answered the monitor's last prompt. Because `MonitorSubSetup` omits only `timer`, no change is needed in `src/monitor/manager.ts`.
2. In the fulfilled-result callback of `flush`'s `promptResult` promise, after the `generation !== reg.resetGeneration` early return and before `reg.firstPrompt = ''`, add the rotation branch: when a recorded identity exists and differs from `result.session`, adopt the new identity, restore `reg.firstPrompt` with `monitorFirstPrompt(reg.persona, reg.delimiter)`, and return without recording the reply or delivering a suggestion. On every other answered result, record `result.session` as the current identity before proceeding to the existing clear-record-parse-deliver sequence. Do not move or edit the `isCurrent` check, the `inFlight` assignment, the failed-result branch, the rejection handler, or the generation guards.
3. Run `$janissary/scripts/run.mjs check-diff` and resolve any failures before moving on.

## UI design

None. The change runs inside the monitor flush callback and adds no command, flag, key binding or interface element. The visible effect is that a suggestion from a replaced core session no longer appears in the reporting tab, and the next flush of that monitor carries the persona primer again.

## Tests

1. Requirements 1–6: in `src/monitor/manager.test.ts`, add a case that starts an external monitor, settles the first flush with a success carrying one session identity, closes the owner tab's core session through the fake ACP, flushes a second batch and settles it with a success carrying a different identity. Assert no stale suggestion was delivered into the reporting feed and no stale reply appears in the context transcript, then flush a third batch and assert its prompt contains the persona body, the `[SUGGESTION]` reply-format instructions and the trust-framing instructions. With the pre-fix behavior the stale suggestion is delivered and the third prompt carries no primer.
2. Requirement 7 / regression coverage: the existing reset, stop, refusal, failed-flush and normal-delivery cases named in `Preserved behavior` must still pass; `$janissary/scripts/run.mjs check-diff` exercises them.

## Out of scope

- Spec edits: no functional spec change is needed for this internal session-identity guard.
- Help pages and user/developer documentation: the recorded work item calls for none.
- Changing `MonitorManager.start`, the `ask` path, the reset mechanics, or how `connections close` works.
- Changing the `resetGeneration`, `isCurrent`, `inFlight` or refusal handling.
- Touching the other pull-request backlog entry or the pull request title and description.

## Verification

`$janissary/scripts/run.mjs check-diff` first — lint, incremental typecheck, and the affected server tests including all of `src/monitor/manager.test.ts`. Then read `src/monitor/live-monitors.ts` and confirm the answered-result callback compares `result.session` with the recorded identity before any reply or delivery, re-primes and returns on a mismatch, adopts the new identity, and leaves both generation checks, `isCurrent`, `inFlight` and the refusal branch unchanged. Finally, in the running app, start a monitor on a role, let it deliver one suggestion, run `connections close acp:<role>:<model>` for that core row, trigger another flush, and confirm the discarded-session reply produces no suggestion while the following flush's prompt again begins with the persona instructions, the `[SUGGESTION]` format and the trust framing.
