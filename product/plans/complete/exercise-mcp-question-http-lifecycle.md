# Exercise the question lifecycle over the real MCP listener

**Complexity: 1/10** — Three lifecycle scenarios with zero production code changes (p=3.07).

## Goal

Protect the loopback MCP integration against regressions in answer delivery, panel cancellation, and caller disconnection. The tests drive the production HTTP adapter far enough to see the same results a connected caller sees.

## Requirements

1. “Assert a question call reaches the queue and receives the selected answer.”
2. “A panel Cancel returns the documented result.”
3. “Disconnect releases the active request and promotes a queued one.”

## Design decisions

- Use a colocated integration suite to run the production manager, listener, handler, executor, and question queue together.
- Issue actual HTTP tool calls and retain a separate abort controller for each, so one client can abandon its response without ending another call.
- Wait for both requests to reach the real question queue before disconnecting the first client. Release all outstanding responses and dispose the listener during cleanup.

## Preserved behavior

1. The local listener still advertises only the question tool, with no extra tools. The `serves a tools/list call that returns exactly question` case in `src/mcp/manager.test.ts` exercises the inventory.
2. A panel cancellation still returns its exact cancellation result without recording a withdrawal. The `returns Question cancelled. when the user cancels in the panel` case in `src/mcp/executor.test.ts` exercises this distinction.

## Assumptions

1. `src/mcp/manager.ts:123` implements `dispose()` to stop the real listener and handler.

## Existing functionality

1. `src/http-test-fixture.ts:125` exports `loopbackReachable` to skip socket tests when a sandbox cannot bind or connect.
2. `src/questions.ts:58` implements `answer`, the operation the panel's reply reaches through the controller.

## Implementation steps

1. Add `src/mcp/manager-http.test.ts` with a real manager, its temporary project state, and a real question queue. Run the HTTP calls through the loopback listener and verify the resulting text and queue transitions. Keep the already-covered tool inventory and unit cases separate. Run `$janissary/scripts/run.mjs check-diff`.
2. Clarify the direct HTTP disconnect semantics in `product/specs/mcp-server.md`. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The suite covers the existing approval panel and its Cancel action through the queue operation that handles either choice.

## Tests

1. In `src/mcp/manager-http.test.ts`, send an approval question to the loopback address, choose an offered option and verify the HTTP tool reply carries that answer (requirement 1).
2. Send a question and select Cancel, then verify `Question cancelled.` is a normal HTTP tool reply (requirement 2).
3. Deliver two requests for the same tab, disconnect the caller of the first request and verify that the second appears and can return its own answer (requirement 3).

## Out of scope

New application behavior and changes to the remote relay or the MCP tool schema.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Read the cancellation section of `product/specs/mcp-server.md` alongside `src/mcp/manager-http.test.ts` and confirm that the suite starts a local listener, sends two separate HTTP requests, disconnects the first, and answers the promoted question through the second request. A test that directly aborts a queue entry or ends both requests would not establish the documented behavior.
