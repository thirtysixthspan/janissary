# Release remote MCP questions on final close

**Complexity: 2/10** — About 11 added lines across two production files, with four requirements (p=4.23).

## Goal

Remove outstanding questions whose remote channel has closed, including questions directed to tabs that remain open.

## Requirements

1. “Release its live registrations” when the remote channel reaches final close.
2. Final close happens “without emitting a withdrawal notice”.
3. Final close happens without emitting “a result”.
4. “Ignore old settlements after clearing the corresponding relay entry,” including when the same ID is reused.

## Design decisions

- The relay owns each remote call's controller and can cancel it through the queue's existing registration signal. Use a symbol-valued abort reason to distinguish final cleanup from a caller's cancellation.
- Cancel the cleared entries in reverse registration order. This removes the closing channel's queued questions before its active question can promote them.
- Only settle and send a result while the map contains the original entry.

## Preserved behavior

1. Re-sending an outstanding call joins its existing question. It must never open a second question. Existing test `attaches a re-sent call to the in-flight question instead of registering a second` in `src/remote/mcp-relay.test.ts`.
2. A recoverable transport loss keeps the remote session. It must never invoke the final-close callback. Existing test `does not call onFinalClose when closed with a session id` in `src/remote/channel/index.test.ts`.
3. A caller cancellation withdraws its outstanding question and promotes the successor. It must never clear the successor. Existing test `withdraws an unanswered question on cancel and shows the next queued one` in `src/remote/mcp-relay.test.ts`.

## Assumptions

1. `src/remote/entry-factory.ts:160` wires `onFinalClose` to the relay's `clear`, independently of the ordinary transport close path.
2. `src/remote/mcp-relay.ts:47` calls `pending.set(frame.call, entry)` before the executor registers its question.

## Existing functionality

1. `src/questions.ts:30` uses `cancelEntry` from the registration's abort listener to cancel an individual question.
2. `src/mcp/executor.ts:19` supplies `question-withdrawn` as the queue's withdrawal callback.

## Implementation steps

Add the final-close abort reason and have the executor skip notification for that reason. Have the relay clear its entries, abort their controllers back to front, and check the current entry before sending any settled result. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. Final channel close removes its questions from surviving tabs. If an unrelated question was waiting on a surviving tab, its panel appears next.

## Tests

- In `src/remote/mcp-relay.test.ts`, close the real channel twice with active and queued questions from that channel on another open tab. Assert the unrelated question is promoted directly and no withdrawal or result is sent for requirements 1, 2, and 3.
- Extend the existing relay test for clearing a call ID, then re-register and answer a fresh call with that ID. Assert only the new result is sent for requirement 4.

## Out of scope

Changes to link recovery timings, remote authorization, or call ID retention.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Launch an MCP-enabled remote harness from the app and have it ask a question on an independent local tab. Leave the question open and close the last tab of that remote session. On the local tab, the remote question disappears and a queued question from another caller can now be answered. A panel that still shows the remote question or a withdrawal notice for that question signals a failure.
