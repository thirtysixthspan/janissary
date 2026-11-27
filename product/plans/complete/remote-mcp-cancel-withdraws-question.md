# fix: wire remote MCP cancellation through to the local question

**Complexity: 6/10** — ~26 added production lines across 8 files, 17 requirements, 16 test scenarios (p=6.35)

## Goal

A remote harness that abandons an MCP `question` call currently leaves the local question panel up and the tab's queue frozen, with no explanation. Wire the far side's caller abort and grace-expiry paths to the local executor's existing abort handler so the question is withdrawn, the `Question from <tab> withdrawn` notification is recorded, and the next queued question appears — the same behavior a local caller already gets. Work item: "wire remote MCP cancellation through to the local question". The recorded entry says the gap is that "a remote caller that gives up leaves the local question registered, its panel open, no `Question from <tab> withdrawn` line, and the next queued question blocked."

## Requirements

1. The protocol admits "an mcp-cancel server frame carrying the call id" in its server-frame registry, and that frame "needs no base64 field" (entry Proposal).
2. A decode case "in src/remote/frame/decode.ts" recovers the call id from a well-formed `mcp-cancel` frame and refuses one with a missing or empty call id as malformed rather than dispatching it (entry Proposal; codec convention).
3. "An entry in src/remote/channel/types.ts" classifies `mcp-cancel` as a channel frame so it reaches the local handler (entry Proposal).
4. The frame is added "within protocol 49": the pinned version literal stays 49, the version-49 changelog names the new frame, and adding it does not bump the version or change the handshake (entry Proposal; `protocol.test.ts` "is 49").
5. The far side sends `mcp-cancel` with the call's id "from the abort handler in relay" when the harness's own request signal aborts (entry Proposal).
6. The far side sends `mcp-cancel` with the call's id "from the grace-expiry fail() path before rejecting" each held call (entry Proposal).
7. A call answered by an `mcp-result` sends no `mcp-cancel`, so the normal settlement path is untouched (`serve-mcp.ts` `result()`).
8. "In src/remote/entry-factory.ts route it to the relay" so the local handler consumes an inbound `mcp-cancel` (entry Proposal).
9. "In src/remote/mcp-relay.ts keep one AbortController per pending call" (entry Proposal).
10. The relay aborts the matching controller "on mcp-cancel" (entry Proposal), ignoring a cancel for an unknown call id.
11. The aborted signal reaches `createLocalExecutor`'s "named abort handler" so it "withdraws the panel, records the withdrawal notification, and shows the next queued question" (entry Proposal).
12. The relay clears the controller "on settlement" (entry Proposal), so a cancel arriving after the answer has no effect and records no withdrawal notification (`executor.ts` `if (settled) return`).
13. A cancel for a call already cancelled, or a second cancel for the same call, changes nothing further (AbortController idempotence).
14. On the channel's final close the relay keeps its existing semantics: it discards pending entries without sending a cancel frame or recording a notification (channel close is not a caller abort).
15. "Keep the in-flight and settled re-send dedupe and the malformed-argument path" working exactly as before (entry Proposal).
16. "Keep every hold, re-send and second-drop case in src/remote/serve-mcp.test.ts passing" (entry Proposal), including the grace-expiry and detached-call refusals.
17. "Add colocated tests for abort before answer and abort after answer" (entry Proposal).
18. A cancel reaches the transport even while the link is down: the far side's link gate holds `mcp-call` frames but must not hold `mcp-cancel`, so a grace-expiry cancellation is queued by the detached peer instead of being dropped.

## Design decisions

- `mcp-cancel` is a server frame (far → local), because the far side is the party that abandons a call and the local side owns the question. It carries only `call`, matching the correlation id on `mcp-call`/`mcp-result`; no binary field is needed, so the codec's exhaustive base64 table gets an empty entry rather than a new encoding rule. Source: entry Proposal; `src/remote/base64-fields.ts` `BINARY_FIELDS`.
- The frame lands in protocol 49 rather than a new version: the codec's version test pins the literal independently of the frame registries, and the entry explicitly says "within protocol 49"; the version-49 changelog comment is extended to describe the new frame so the codec's own test (`mentions the current version in the source changelog`) still documents what this version covers.
- The far side sends the frame from the two places that already abandon a call — the relay's `signal.addEventListener('abort', onAbort)` and the grace-expiry `fail()` helper — before each path rejects its MCP promise. `result()` stays untouched, so a real answer never produces a cancellation. Source: `src/remote/serve-mcp.ts`.
- The far side's link gate in `RemoteProcesses` holds ordinary frames while detached; `mcp-cancel` is the one frame allowed through, so the detached peer queues it for a later attach. Calls stay gated, so no new question can be opened for a later attach. Source: `src/remote/serve-processes.ts` `if (this.linked()) return this.send(out)`.
- The relay supplies one `AbortController` per pending call to the local executor instead of an anonymous one. Cancellation is a signal on that controller, leaving the executor's own `settled` flag and listener removal as the single authority on whether a withdrawal notification is recorded. Source: `src/mcp/executor.ts` `const onAbort`.
- The pending entry keeps its stored result for settled re-send dedupe while dropping only its controller on settlement, so a late cancel cannot erase a result already replayed to a re-send. The final-close hook keeps dropping entries without aborting: closing the transport is not a caller abort. Source: `src/remote/mcp-relay.ts` `if (existing.result !== undefined) answer(...)`.
- The channel classifier and the entry-factory frame switch are extended in the same change as the union, so no inbound frame is ever decoded and then misrouted into the transcript branch. Source: `src/remote/channel/types.ts` `isChannelFrame`.
- Tests stay colocated with the code they pin: relay-level tests drive the real `Questions`, `createLocalExecutor` and notification delivery so abort-before-answer and abort-after-answer are asserted end to end at that seam, while far-side tests assert the frames actually sent on abort and expiry.

## Preserved behavior

1. An in-flight re-send attaches to the one registered question rather than opening another. Negative assertion: adding a controller to the pending entry must not make a re-send look like a new call. Test: `src/remote/mcp-relay.test.ts` "attaches a re-sent call to the in-flight question instead of registering a second".
2. A settled re-send replays the stored result without re-registering. Negative assertion: a cancellation must not clear the stored result or cause a second execution. Test: `src/remote/mcp-relay.test.ts` "answers a re-sent settled call from the stored result without registering again".
3. Malformed arguments are answered locally with the exact error and leave the call id unclaimed. Negative assertion: the new controller must be created only after arguments parse, never for a malformed call. Test: `src/remote/mcp-relay.test.ts` "answers malformed arguments as an error and lets a later valid call with the same id register".
4. The relay's final-close hook empties the pending map so a re-send starts fresh. Negative assertion: closing the channel must not send a cancel frame or record a withdrawal notification. Test: `src/remote/mcp-relay.test.ts` "clears the map on channel close so a re-send registers a fresh question".
5. An aborted far-side call sends no further `mcp-call` frames. Negative assertion: the new `mcp-cancel` frame must not be mistaken for a re-sent call. Test: `src/remote/serve-mcp.test.ts` "drops an aborted call and sends nothing further for it".
6. Calls hold through a link loss and are re-sent with their original ids when it returns. Negative assertion: the cancel frame must not be sent for calls that are only waiting on a link. Test: `src/remote/serve-mcp.test.ts` "holds in-flight and new calls through a link loss and re-sends them when it returns".
7. A held call fails with `Janissary is not connected.` when the grace window expires. Negative assertion: sending a cancel frame must still let the far-side promise reject with the same text. Test: `src/remote/serve-mcp.test.ts` "fails every held call with the detach error when the grace window expires".
8. A second drop after an in-window re-send still expires the call. Negative assertion: a cancel frame must not interfere with the re-send or the second grace window. Test: `src/remote/serve-mcp.test.ts` "fails a held call when the link drops a second time after an in-window re-send".
9. The remote protocol stays at version 49 and its changelog mentions that version. Negative assertion: adding a frame must not bump the handshake version or trip the pinned literal. Test: `src/remote/protocol.test.ts` "is 49".
10. An executor abort after the answer records no withdrawal notification. Negative assertion: a late `mcp-cancel` must not resurrect the executor's abort listener. Test: `src/mcp/executor.test.ts` "does not notify when the signal aborts after the question was answered".

## Assumptions

1. A remote caller's abort is observed on the `AbortSignal` the MCP handler passes to the tool executor — `src/remote/serve-mcp.ts:183` `signal.addEventListener('abort', onAbort, { once: true })`.
2. Grace expiry rejects each pending call after the final tick — `src/remote/serve-mcp.ts:147` `if (++this.ticks >= GRACE_TICKS)`.
3. The local executor's abort listener withdraws the panel only while its question is pending — `src/mcp/executor.ts:18` `const onAbort = () => { if (settled) return; ... }`.
4. `Questions.register` resolves an aborted entry and activates the next queued one for that tab — `src/questions.ts:25` `register(request: QuestionRequest, signal?: AbortSignal)`.
5. A relayed question resolves to `Question cancelled.` when its signal aborts — `src/mcp/executor.ts:25` `signal.aborted ? QUESTION_CANCELLED : answer`.
6. Frames sent by the far side are server frames and each type needs a codec entry — `src/remote/protocol-frames.ts:203` `export type ServerFrame`.
7. The codec's binary-field table is exhaustive over frame types — `src/remote/base64-fields.ts:14` `BINARY_FIELDS: Record<RemoteFrame['type'], readonly BinaryField[]>`.
8. The version literal is pinned by a test independent of frame membership — `src/remote/protocol.test.ts:1288` `it('is 49', ...)`.
9. Only classified channel frames reach the entry factory's `onFrame` handler — `src/remote/channel/types.ts:63` `isChannelFrame`.
10. Far-side frames pass through a link gate that returns false while detached, and the detached peer queues frames written while it is parked — `src/remote/serve-processes.ts:69-72` `if (this.linked()) return this.send(out); return false;` and `src/remote/serve-detach.ts:78` `emit(frame)`.

## Existing functionality

1. Far-side per-call abort listener that rejects the MCP promise — `src/remote/serve-mcp.ts:183` `onAbort`.
2. Grace timer that re-sends, then fails, every held call — `src/remote/serve-mcp.ts:145` `graceTick()`.
3. Local executor's named abort handler and settlement guard — `src/mcp/executor.ts:18` `onAbort`.
4. Per-tab question queue with cancellation that promotes the next entry — `src/questions.ts:25` `register(`.
5. Correlated MCP frames with an exhaustive server-frame registry — `src/remote/protocol-frames.ts:366` `SERVER_FRAME_TYPES`.
6. Codec decode dispatcher with an exhaustiveness guard — `src/remote/frame/decode.ts:37` `decodeKnownFrame`.
7. Exhaustive base64-field declaration — `src/remote/base64-fields.ts:14` `BINARY_FIELDS`.
8. Channel-frame classifier and its keyed set — `src/remote/channel/types.ts:55` `CHANNEL_FRAME_KEYS`.
9. Local dispatch of inbound MCP frames to the relay — `src/remote/entry-factory.ts:144` `case 'mcp-call': { mcpRelay.handle(frame); break; }`.
10. Relay's pending map with in-flight and settled re-send dedupe, plus the final-close hook — `src/remote/mcp-relay.ts:12` `const pending`.
11. Explicit `question-withdrawn` notification delivery — `src/mcp/executor.ts:20` `notify(managers, 'question-withdrawn', label)`.
12. Detached-peer frame queueing for later attach — `src/remote/serve-detach.ts:78` `emit(frame)`.

## Implementation steps

1. Frame contract and local routing, in one checkpoint so the channel never decodes a frame it cannot dispatch: add `mcp-cancel` with its `call` id to the server-frame union and `SERVER_FRAME_TYPES` in `src/remote/protocol-frames.ts`; add its empty base64 entry in `src/remote/base64-fields.ts`; add a decode case alongside `mcp-call` in `src/remote/frame/decode.ts`; add it to `ChannelFrame` and `CHANNEL_FRAME_KEYS` in `src/remote/channel/types.ts`; extend the version-49 changelog comment in `src/remote/protocol.ts` without changing `REMOTE_PROTOCOL_VERSION`; give the relay a cancel method that aborts the matching held controller, backed by one controller per pending entry that is cleared in the settlement path in `src/remote/mcp-relay.ts` while `clear()` keeps its existing drop-only behavior; route the frame to that method in the `onFrame` switch in `src/remote/entry-factory.ts`. Update the expected server-frame list in `src/remote/protocol.test.ts` and add a codec round-trip case there. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Far-side emission: in `src/remote/serve-mcp.ts`, send `mcp-cancel` carrying the call id from the existing relay abort listener before it deletes the entry and rejects, and from `fail()` before it rejects a grace-expired call; leave `result()` and the re-send path unchanged. In `src/remote/serve-processes.ts`, let `mcp-cancel` through the far side's link gate while keeping every other frame gated as before, so an expiry during a link loss is queued by the detached peer. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Behavioral tests: extend `src/remote/mcp-relay.test.ts` with the abort-before-answer and abort-after-answer cases and a mock of notification delivery; extend `src/remote/serve-mcp.test.ts` with assertions on the frames sent on abort and grace expiry. Keep every existing case in both files unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. A cancelled remote call withdraws the existing question panel on the named tab; no new panel or control is introduced.
2. The withdrawal is reported through the existing `Question from <tab> withdrawn` notification line, with no extra user-facing text.
3. Withdrawal promotes the next queued question for that tab into the same panel without a second prompt.
4. A question already answered by the human keeps its answer and shows no withdrawal line.
5. No key bindings, styles, dialogs, or web components change.

## Tests

- `src/remote/protocol.test.ts`: `mcp-cancel` appears in the admitted server-frame list; an encoded frame decodes back to its call id; a field-free frame is refused as malformed by the existing "decodes every admitted type" case; version stays 49 (requirement 4).
- `src/remote/mcp-relay.test.ts`: abort before answer aborts the registered question, withdraws the panel, records exactly one `Question from asker withdrawn` notification and reveals the next queued question (requirements 10–12); abort after answer records no notification, leaves the stored result replayable for a re-send and causes no second answer (requirements 12–13); a cancel for an unknown call is ignored (requirement 10).
- `src/remote/serve-mcp.test.ts`: caller abort sends `mcp-cancel` for that call id before rejecting; grace expiry sends one `mcp-cancel` per held call before rejecting even with the link down, proving the far-side gate lets cancellations through; an answered call sends no cancel (requirements 5–7, 18).
- `src/remote/manager.test.ts`: an inbound `mcp-cancel` frame over a real channel withdraws the local question and promotes the next queued one, proving the classifier and entry-factory routing (requirement 8).
- Existing cases named in `Preserved behavior` remain in place and keep passing (requirements 15–16).

## Out of scope

- No protocol version bump; the frame is added within protocol 49 as the recorded entry specifies.
- No change to local MCP calls, the `question` tool contract, the four validation errors, or the harness launch flags.
- No new cancellation API in the MCP SDK and no change to how a harness times out its own tool call.
- No change to the far side's hold/re-send/grace timings, token, port claim, or bind-failure reporting.
- No edits to user or developer documentation; behavior documentation lives in `product/specs/` and in-app help pages.

## Verification

Run `$janissary/scripts/run.mjs check-diff` after each implementation step, then check against the running app:

1. Open a remote harness with MCP on a host that is reachable, and have it ask a question through the `question` tool naming a local tab. Expect the panel on that tab and the answer to reach the harness; that proves the normal path still works.
2. Repeat, abandon the harness's call (stop the harness or interrupt its tool request), and watch the local tab. Expect the panel to close, a `Question from <tab> withdrawn` line to appear, and the next queued question for that tab to take its place. A failure looks like a panel that stays open with no notification.
3. Queue two questions from a remote harness, answer the first, then abandon the second. Expect the first answer to be delivered and no withdrawal line for it. A failure looks like a withdrawal notification for an already-answered question.
4. Detach the remote session with a question pending and wait past the 60-second grace window. Expect the harness to fail with `Janissary is not connected.` and the local panel to be withdrawn rather than left behind.
