# Deliver subagent messages to live caller sessions
**Complexity: 7/10** — ~225 added production lines including cancellation extraction, 24 requirements, 42 scenarios (p=7.17)

## Goal

Deliver subagent started/completion messages as ordinary prompts to the same caller session that launched them. Supply the serializer's exact one-line JSON as the logical prompt while retaining ordinary core prompt preparation. Keep one FIFO per caller tab and ask/tell role, publish each prompt's own background reply before starting the next delivery, and silently drop messages whose original session ended before admission.

Source: `product/plans/complete/subagent.md`, preserved unchanged as the canonical feature record. This is ordered subplan 13 of 23.

## Decisions and dependencies

Dependencies: `product/plans/ready/subagent-11-delivered-prompt-echoes.md` supplies `PromptResultOptions.echo`, pending echo projection and the role receipt contract; `product/plans/ready/subagent-12-delivery-state-and-ownership.md` supplies `SubagentDelivery`, `serializeSubagentMessage`, `enqueueSubagentMessage`, `pendingSubagentMessages`, immutable `run.acpCaller` and `AgentRunManager.disposing`. Consume those contracts after they land. No launcher or executor is needed to verify this unit.

Session binding governs admission of a queued message. Once admitted as a logical prompt, it retains ordinary ask/tell fallback, cancellation, reset and refusal behavior, including its background reply. Do not carry an admission predicate onto `Attempt` or `AcpPendingPrompt` and then use it to cancel an already-admitted prompt's fallback.

The outer delivery check is insufficient: `src/acp/manager.ts:84,156` (`queueFor`, `this.close`) can synchronously close a removed-model session after that check, leaving an enabled fallback entry which would otherwise start a replacement session with the old message. This unit adds an internal prompt-admission callback contract and repeats the captured-session check after those effects. The public `AcpPromptResult` union and plugin API stay unchanged.

Implement and verify only against existing repository code and the completed earlier dependencies. Other units own their own changes; references to them explain integration boundaries and do not authorize future API calls. Every new production module stays within 200 counted lines, source imports name defining modules directly with .js extensions, and shared wire definitions are imported by the client.

## What already exists (reuse, don't rebuild)

| Existing owner | Reuse |
| --- | --- |
| `src/acp/manager.ts:64,71,104` (`promptResult`, `run`, `attempt`) | Synchronous initial admission followed by the ordinary logical prompt and model-attempt machinery. |
| `src/acp/manager.ts:138,151` (`settleAttempt`, `queueFor`) | Final settlement versus fallback; current catalog filtering can close the caller before initial admission. |
| `src/acp/run-prompt.ts:109` (`runToolLoop`), `src/acp/drive-loop.ts:16,69` (`corePrimer`, `runAcpToolLoop`), and `src/acp/loop.ts:39` (`sent`) | The logical `request.prompt` reaches the loop unchanged; the first raw provider prompt receives the ordinary core primer followed by that logical prompt. |
| `src/acp/session-manager.ts:16,32,106` (`CoreSession`, `sessionIdentity`, `close`) | Internal session lifetime and the common close hook, including plugin sessions, fallback, dead agents and removed catalog entries. Provider IDs are not lifetime tokens. |
| `src/acp/prompt-state.ts:5` (`PromptResultOptions`) | Add the internal admission option beside plan 11's echo, without changing the result union. |
| `src/acp/response.ts:37,49,79` (`appendAcpBackgroundReply`, `runAcpCommand`, `settleAcpPrompt`) | Reply IDs, answering-record selection, one background reply, prompt removal and finish/messageBus ordering. |
| `src/acp/role-state.ts:5,7,12` (`AcpRoleRuntime`, accessors) and plan 12's queue helper | Store pending messages and scheduling ownership on the existing per-role runtime, with no manager-level map. |
| `src/agent/manager.ts:77,98,137` (`closeCaller`, `finish`, `dispose`) and plan 12's `acpCaller` | Terminate only the matching live runs; finish sets outcome/abort synchronously before awaiting cleanup. Existing tab close already terminates all caller runs. |
| `src/tab/cleanup.ts:25` (`runtime.closing`) and `src/managers.ts:96` (`MANAGER_DISPOSE_ORDER`) | Tab-close gating and agent disposal before ACP disposal. |
| `src/acp/manager.ts:161` (`cancel`) | Extract this cohesive cancellation implementation to make room for the admission checks and thin delivery/drain integration. |

## Planned file scope

Add `src/acp/subagent-delivery.ts`, `src/acp/cancel-prompt.ts`, and `src/acp/subagent-delivery.test.ts`. Edit four existing production files: `src/acp/manager.ts`, `src/acp/session-manager.ts`, `src/acp/prompt-state.ts`, and `src/acp/role-state.ts`. Extend `src/acp/manager.test.ts`, `src/acp/manager-fallback.test.ts`, and `src/acp/plugin-session.test.ts`. Update `product/specs/acp.md` and plan 1's `product/specs/subagent.md`.

Only the named implementation, test and spec/help files belong to this unit. Update the named behavior spec with this unit rather than deferring it to final documentation work. A new colocated test named above may be created when absent. Keep additions focused; do not compact code to fit the line limit.

## Implementation steps

1. Extract the existing cancellation body into `cancelAcpPrompt` in `cancel-prompt.ts`. Keep `AcpManager.cancel` as a delegate supplying managers, label, role, the captured session's cancel capability and a closure over the existing protected `isCurrent` check. The helper retains the runtime/request identity checks and calls `managers.acp.close` on cancellation failure. Preserve cancellation-promise sharing, synchronous abort, delayed settlement, error text and close races. No new public session accessor is needed.

2. In `prompt-state.ts`, define readonly `AcpPromptAdmission` with synchronous `isCurrent` returning boolean and `onDrop` returning void; add optional `admission` to `PromptResultOptions`. In `run`, use one local `dropIfNotAdmitted` helper at entry, again after role settings/`queueFor` and before any refusal transcript write, and immediately before the initial `attempt` after reading native settings. A false check calls `onDrop` once, resolves `onDone` once with the existing unanswered `ACP session closed.` result, and returns without creating a pending prompt, record, busy entry or session. Even a zero-model result must pass the post-`queueFor` check, so catalog removal becomes a silent stale drop. An absent admission option retains ordinary behavior. The delivery supplies nonthrowing callbacks and uses its local drop marker, never error-text matching, to suppress publication. Do not forward admission into the attempt or pending request.

3. Add optional symbol fields `subagentDeliveryInFlight` and `subagentDrainScheduled` to `AcpRoleRuntime`. Each dispatch/scheduled drain owns a freshly minted symbol. A callback clears or resumes only while its captured token still equals that field; reset or another owner's work cannot be overwritten by an old callback. These fields are runtime-only and do not enter tab views or records. Add thin `AcpManager.deliver(label, role, delivery)` forwarding to `deliverSubagentMessage` in `subagent-delivery.ts`; the third argument is plan 12's complete `SubagentDelivery` envelope. Reuse `enqueueSubagentMessage`, including completion coalescing and append-at-tail order. Do not create a runtime for a missing tab or queue on a closing tab.

4. `drainSubagentMessages` leaves the queue alone while the role has a prompt, a delivery in flight, or a scheduled drain. Otherwise discard stale heads until one can run or the queue is empty. The shared private `isCurrentSubagentCaller` predicate requires the original runtime still owned by the label, the envelope's tab incarnation, a nonclosing runtime, matching envelope/argument caller role, the captured current internal session identity, and `!managers.agent.disposing`. Use this same predicate for the admission callbacks in step 2. Consume the selected head and claim its in-flight token synchronously before calling `promptResult`, so a second synchronous delivery cannot overtake it even when its prompt refuses or finishes inline. A started already consumed for delivery cannot be coalesced by its completion. Stale drops produce no prompt, echo or background reply; continue toward the next ready head.

5. The private `dispatchSubagentMessage` helper mints one replyId, serializes only `delivery.message` through `serializeSubagentMessage`, and composes the exact echo `<caller role> ← subagent:<canonical subagent role> <message status>`. Call `promptResult` with that exact one-line JSON as its complete logical input, caller role, `appendRefusalToTranscript: false`, replyId, echo and the admission callbacks. Add no delivery-specific role prefix or envelope, and retain the ordinary `corePrimer` wrapping at the raw provider boundary. Publish a nondropped result exactly once with `appendAcpBackgroundReply`, using the echo as input and the result's answering caller record. Follow `runAcpCommand` for unexpected promise rejection conversion. A current session's ordinary refusal, such as a still-connecting remote channel or an empty role, is this echo's reply and is not retried. After admission, fallback may answer from a replacement model; reset/close may answer `ACP session closed.`. Neither becomes a silent stale drop. Before publication require the same open tab runtime/incarnation, but do not require the old session identity again. An old tab's admitted result never writes into a reincarnated tab. Release an owned flight token in the result callback's finally path, then schedule the next drain only when that token was still owned, including after an immediate refusal or admission drop that never called `settleAttempt`.

6. Add `scheduleSubagentDrain` to `subagent-delivery.ts`. Immediately after the final `attempt.onDone` in `settleAttempt`, call it with the original runtime captured by the request's finish closure, label and role. Pass that runtime as an explicit method argument rather than adding an `Attempt` or pending field. Do not schedule between fallback attempts. Claim a scheduled token only when none exists, then defer the drain through two microtask turns: an inline `promptResult` may resolve before its caller attaches `.then`, so one turn alone can run before the prompt's own background reply. Keep the scheduled token until the deferred callback, so a new idle arrival cannot bypass that publication order. The callback checks tab/runtime ownership and its own token before clearing it and calling the drainer; delivery-head admission still performs the full session check. Typed ask/tell retain `ACP: a prompt is already running.` while their role has a typed or delivered prompt; neither tokens nor the pending subagent queue turn typed prompts into queued work.

7. Add optional private `CoreSession.closing` in `session-manager.ts`; set it synchronously before any close hook and make `sessionIdentity` return undefined for a closing holder. The `session` method's `current` closure, `entryOf` and `isCurrent` also reject that holder. This invalidates delivery admission during synchronous termination callbacks before the holder is removed. Before `settleAcpPrompt`, call `closeSubagentSession` with the captured holder runtime/identity. Clear that role's pending queue and invalidate both scheduling tokens first; then call `AgentRunManager.finish(run.id, 'terminated')` for each still-live run matching caller label, captured runtime incarnation, `run.acpCaller.role` and `run.acpCaller.sessionIdentity`. Human runs, other roles, other sessions/incarnations and already-finished runs are untouched. Initiate every finish before prompt settlement and handle rejected cleanup promises without delaying close; finish's synchronous outcome/abort supplies the ordering guarantee. Use the existing runtime without allocating one for holderless close; clear any pending state there, but terminate no session-owned runs without a holder identity. All inherited close paths use this hook, including plugin ask sessions, reset, dead agent, fallback and removed catalog models. Shutdown admission/drain also drops work while agent disposal precedes ACP disposal.

8. Respect the measured budgets: manager.ts is 192 counted lines, and plan 11 adds two metadata-forwarding lines. Its new admission checks, delegate and drain cannot all fit within the remaining six lines, so perform step 1's cancellation extraction unconditionally. Budget the remaining manager below 200, the new cancellation module around 35, and the delivery module below 180 counted lines; split no logic by compressing statements or removing comments. Session-manager.ts is 145 before plan 5's provider-ID additions, prompt-state.ts 19 before plan 11's echo, and role-state.ts 11 before plan 12's queue; their small changes remain under 200. Update the specs with admission/drop versus admitted refusal/fallback, FIFO/publication ordering, session-close termination and shutdown gating.

## Tests

Use synthetic envelopes and real `AcpManager` entry points, with the session/loop fakes from `src/acp/manager-fallback.test.ts:32` (`setup`) and background/record assertions from `src/acp/plugin-session.test.ts:411,568`. Do not add a launcher fixture. Cover these delivery scenarios in `subagent-delivery.test.ts`; parameterize ask/tell where the distinction matters:

1. Idle delivery supplies exactly the serializer's one-line JSON at `AcpManager.promptResult`, `request.prompt` or the logical `runToolLoop` input, with no delivery-specific role prefix or envelope/internal fields. A fixture observing the first raw provider prompt must retain the ordinary `corePrimer` followed by that JSON, as in the existing loop path; do not assert bare JSON at `session.prompt`.
2. Busy typed prompt queues delivery until final settlement; busy delivered prompt queues the next message as well.
3. Interleaved runs retain ready-order FIFO and one message per prompt.
4. A queued started is dropped by its own completion without moving that completion ahead of another run's ready message.
5. A started already admitted still has its own prompt before its completion.
6. Ask/tell and two tabs keep independent queues and tokens.
7. Ordinary typed prompts remain refused, never queued, while a delivered prompt runs.
8. Async settlement publishes its own background reply and state bookkeeping before the next prompt starts.
9. Inline typed completion has the same publication order even though `.then` is attached after `run` returns.
10. Two synchronous deliveries after an inline delivered answer keep the first reply before the second prompt.
11. Two synchronous deliveries after an immediate no-model refusal publish each refusal once, FIFO, without retries or a stuck token.
12. A current still-connecting remote session publishes the ordinary refusal under its exact delivered echo once.
13. A queued head whose session identity changed is silently dropped; a later valid head can proceed.
14. A missing tab is dropped without runtime creation.
15. A closing tab is dropped.
16. A label reused for another incarnation receives neither a stale prompt nor an old admitted background reply.
17. Disposal drops arrivals and an already-scheduled drain, including an empty agent manager; no ACP session starts during shutdown.
18. A removed current catalog model with another enabled entry closes the captured session during `queueFor`; the guard drops the old message before initial `attempt`, with no replacement connect, record prompt, busy token or echo.
19. Removal with no remaining enabled entries is also a silent drop, distinct from a current session's ordinary no-model refusal.
20. Session replacement/reset from the role-settings/native-settings fixture between the initial guard and attempt is caught by the repeated admission checks.
21. A closing holder rejects a synchronous delivery attempted from a termination/abort callback, before its identity is deleted.
22. Reset clears the queue and starts matching run termination before the running prompt settles or any drain executes.
23. Close selects only live runs matching all caller ownership fields and is harmless without a holder.
24. A dead caller agent follows the same clearing and termination path.
25. An admitted caller prompt falling back, including an inline error from the fake session, clears that old session's queue and terminates its subagents; no drain occurs between model attempts.
26. An admitted delivered prompt still completes through ordinary fallback with its original replyId/echo and the answering caller record; its admission guard is not reapplied.
27. Reset of an admitted delivery publishes its ordinary close reply once while old queued messages stay dropped.
28. After reset, start a new session and delivery on the same role runtime, then release the old result callback: it cannot clear the new flight/scheduled tokens or drain its queue.
29. Let an old scheduled microtask fire after reset and replacement scheduling: it cannot clear the replacement token or start another prompt.
30. Rejected prompt promises settle once and release only their own flight token, allowing the next valid message to progress.

Extend `manager-fallback.test.ts:219` (`filters a disabled current session`) to retain ordinary unguarded typed fallback after catalog removal and test that a guarded rejection calls `onDrop`/onDone once without changing `AcpPromptResult`. Extend `plugin-session.test.ts:702` (`reset cancels only its own question`) with plugin-owned ask delivery/reset ownership, confirming the common inherited close hook. Retain `manager.test.ts:587` (`cancels only the selected role`) and `plugin-session.test.ts:249,669` (cancellation reservation and close races) through the cancellation extraction. The 42-scenario estimate counts the distinct paths within the grouped cases, including typed/delivered busy prompts, role/tab isolation, queued/admitted incarnation drops, disposal arrivals/drains, role/native-settings resets, holderless close, async/inline fallback, and cancellation reservation/close races. Parameter variants and multiple assertions on one path are not counted again.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after implementation changes. Do not run `npm run check`.

Manual or fixture check: Inspect an idle delivery's logical input at `promptResult`, `request.prompt` or `runToolLoop` for the exact serializer JSON without a delivery-specific prefix or envelope; if observing the first raw provider prompt, confirm the ordinary `corePrimer` precedes that JSON. Hold a typed ask prompt, queue A-started then B-completed then A-completed, and observe B-completed then A-completed as separate prompts after the typed reply. Repeat with the current model removed before draining and a second model enabled: verify closure terminates the matching subagents and the old JSON never starts that second session or writes an echo. Start a fresh session and inject a new envelope, then release old callbacks/microtasks and confirm only the new work progresses. Use the same fixture for an already-admitted delivery's ordinary fallback and reset reply. The public launch command remains unwired in this unit.

## Out of scope

No public launch command, executor, human subagent reply producer, automatic retry, restart persistence, role inventory, concurrency limit, plugin API/wire changes, or cancellation behavior change beyond the named extraction. Earlier plans own message/echo contracts; this unit owns only delivery admission, queue scheduling and session-close integration.
