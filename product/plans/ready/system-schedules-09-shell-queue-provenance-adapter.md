# System schedules 09: shell queue provenance adapter

**Complexity: 5/10** — one client adapter must pair opaque receipts with the existing FIFO runner across routing, asynchronous errors, and disposal without changing queue semantics.

The system shell is a retained shell consumer, not a second kind of queue. This plan connects its existing FIFO drain to the receipt contract completed in plan 08.

## Goal

Have the hidden system shell consume structured queue receipts and dispatch each queued line through the normal shell/application route. Preserve FIFO order and ordinary shell behavior, and discard a dequeued receipt whenever that line is intercepted or cannot be dispatched, or the consumer is disposed. Source: `product/plans/ready/add-system-schedules.md`, “Queueing and draining on the client.”

## Decisions and dependencies

- Dependencies: plans 01, 03, 04, 05, 07, and 08. Plan 01 provides the hidden, retained tab lifecycle; 03–05 provide the system shell and its client generation/readiness signals; 07 provides server queue storage; 08 publishes the receipt contract consumed here. Plan 11 supplies structured rows later; client tests must construct structured rows directly and must not depend on that producer. Plans 10 and 11 own harness naming policy and schedule ownership respectively, not this adapter.
- Reuse the published v2 shell capabilities from 08: `nextQueuedCommand()` returns `{ line, receipt } | null`; `dispatchQueuedCommand(receipt)` dispatches the server-held row through ordinary application-or-shell routing; `dispatchQueuedCommand(receipt, { discard: true })` discards it. Receipts are opaque, single-use, and scoped to the issuing plugin and tab incarnation. Do not add server capabilities, alter these results, or change legacy `queueLine`/`nextQueuedLine` behavior in this plan.
- The shell plugin must opt into the two published capabilities in its static declaration and expose narrow, validated shell intents for structured dequeue, dispatch, and discard. Reuse `src/plugins/shell/activate.ts`'s intent table and `src/plugins/shell/shared.ts`'s import-free guards. Keep the existing `queue` and `dequeue` intents available for compatibility; the new consumer uses only the structured path.
- Keep `CommandQueue` and `useCommandQueue` as the sole FIFO and drain state machine. Preserve their public string transport and runner contract. Put receipt pairing in a framework-free shell adapter under `web/src/plugins/shell/`, used by `useShellCommandQueue`; do not create a second queue, mutate core queue semantics, or use line text/origin matching to recover provenance.
- Pair the receipt returned for a dequeue with that one line's runner invocation. Remove it from local adapter state before awaiting any route or dispatch. A manually submitted line has no receipt and continues through the existing `useShellSubmit` behavior. A queued receipt line is dispatched by receipt, not by sending client-authored line text or origin to the server.
- Preserve the existing shell-first rules for `!` lines and bare `clear`, then existing application interception and application dispatch. A shell-routed receipt line runs in zsh through the existing terminal writer, and the FIFO waits for zsh idle as it does today. An application-routed receipt line uses the server-stored row and continues draining on ordinary application completion or error. The adapter returns the same pause/continue meaning expected by `CommandQueue`.
- Discard the receipt in a `finally` path whenever routing intercepts the line, dispatch fails or rejects, the consumer is disposed while the receipt is still outstanding, or another outcome prevents dispatch. Do not discard after successful dispatch because the server consumes the receipt before dispatch side effects. Discard is idempotent, so cleanup may safely race with a consumed receipt. A receipt is never transferred to a later line or terminal generation.
- Retain the current hidden-tab behavior: the system shell stays mounted while hidden and its consumer drains without requiring the tab to become active. Preserve zsh busy/idle gating and terminal attachment readiness; do not dequeue while there is no attached terminal to receive shell input. An application line can continue without writing to the terminal.

## What already exists (reuse, don't rebuild)

| Piece | Where | Relevance |
| --- | --- | --- |
| Published server receipt contract | `product/plans/complete/system-schedules-08-server-queue-provenance.md` (“two separately declared host capabilities”); `product/specs/command-queue.md` (“The additive `nextQueuedCommand()` capability”) | Defines dequeue result, dispatch/discard behavior, receipt ownership and limits. Consume it as published. |
| One framework-free FIFO | `web/src/shared/command-queue/command-queue.ts` (`CommandQueue`); `web/src/shared/command-queue/useCommandQueue.ts` (`useCommandQueue`) | Owns drain, FIFO ordering, wakeups, busy state, attach, and dispose. Keep its string transport/runner contract. |
| Shell queue transport and runner connection | `web/src/plugins/shell/useShellCommandQueue.ts` (`useShellCommandQueue`) | Current transport uses legacy `dequeue`; adapt it to pair structured receipts with the same FIFO runner. |
| Manual shell-line routing | `web/src/plugins/shell/useShellSubmit.ts` (`routeFor`, `shellLine`, `appBar.intercept`, and `dispatch`) | Establishes shell-first routing, application interception, and ordinary error behavior for typed lines. |
| Retained shell component and busy state | `web/src/plugins/shell/ShellTab.tsx` (`ShellTab`, `queueReference`, `onCommandRunning`) | Mounts the consumer and forwards terminal busy/idle signals, including while the tab is hidden. |
| Terminal attachment lifecycle | `web/src/plugins/shell/useShellTabTerminal.ts` and `web/src/plugins/shell/useShellTerminal.ts` | Owns attachment and writes; receipt draining must respect attachment readiness and cleanup. |
| Published intent client | `web/src/plugins/api.ts` (`TabPluginClientCapabilities.intent`) | Sends tab-scoped intents and throws on rejected RPC results; do not add a raw socket path. |

## File scope

- Intent bridge: `src/plugins/shell/{manifest,shared,activate}.ts` and `src/plugins/shell/activate.test.ts` for the manifest opt-in, import-free request guards, and thin intent forwarding to plan 08's existing server capabilities. No other `src/` or plugin API/capability-contract changes.
- Client implementation: `web/src/plugins/shell/useShellCommandQueue.ts`, `web/src/plugins/shell/useShellSubmit.ts` only as needed to expose the existing route decisions, and a focused new `web/src/plugins/shell/queued-command-adapter.ts`. Keep React lifecycle in the existing hook and receipt pairing/cleanup framework-free in the adapter. If an existing source file would exceed the 200-line limit, extract a focused module rather than compacting it.
- Client tests: new `web/src/plugins/shell/queued-command-adapter.test.ts` for receipt pairing and cleanup; new `web/src/plugins/shell/useShellCommandQueue.test.tsx` for hook/transport integration; extend `web/src/plugins/shell/ShellTab.test.tsx` for retained hidden-consumer behavior only if the existing component harness can exercise it. Use the existing client test conventions and do not add a duplicate test of `CommandQueue`'s FIFO algorithm.
- Specs: update `product/specs/command-queue.md` and `product/specs/shell-tab.md` to describe receipt-backed hidden-shell dispatch and discard behavior. The server receipt/API documentation is owned by 08 and is not repeated here. Update developer docs only if client behavior makes a published example inaccurate; this plan adds no capability or API reference surface.
- No `CommandQueue`/`useCommandQueue` changes, schedule producer, scheduler owner, server receipt implementation, or harness policy files are in scope.

## Ordered changes

1. Implement the framework-free receipt adapter around the current string-based `useCommandQueue` transport and runner. It must associate at most the currently dequeued line with its receipt, clear the association before asynchronous work, and provide explicit cleanup for any outstanding receipt.
2. Integrate the adapter into `useShellCommandQueue`. Use the plan 08 structured dequeue and receipt dispatch/discard intents. Keep typed/manual submissions on the existing path and use the existing dispatch result to distinguish application handling from shell fallback.
3. Tie outstanding-receipt cleanup to runner outcomes and hook disposal. Preserve attachment readiness, shell busy/idle waits, hidden operation, and continuation after ordinary shell/application errors.
4. Add focused adapter and client integration coverage, then update the queue and shell behavior specs.

## Tests and verification

Cover structured dequeue and FIFO pairing for repeated identical text; ordinary/manual submissions interleaved with receipt-backed rows; shell-first routing and application dispatch; intercept without dispatch; dispatch rejection/error; successful dispatch consuming its receipt; disposal before dispatch and while dispatch is pending; late completion after disposal; and no receipt reuse by the next line or terminal generation. Verify the application error and shell `false` cases continue to the following queued line, matching current shell behavior. Verify a hidden retained consumer drains without activation/focus and does not dequeue before terminal attachment is ready. Exercise discard idempotence through the fake intent boundary; server receipt validation and ownership remain covered by plan 08 tests.

Run `./scripts/run.mjs check-diff` during implementation, with only this plan's intended client/spec files changed in that implementation diff; the plan-only check is `git diff --check -- product/plans/draft/system-schedules-09-shell-queue-provenance-adapter.md`. Manual integration check: place two lines with identical text but different origins in the system shell queue, one ordinary and one structured, hide the system tab, and verify FIFO execution with provenance only on the structured dispatch. Cause an intercepted queued line and an application dispatch error, then verify the following line runs and each unused receipt is discarded. Also verify a shell `false` line does not stop the next line. Do not require schedule creation or production for this check.

## Out of scope

- Creating structured queue rows or producing schedule firings; plan 11 owns production.
- Interpreting provenance for harness name clashes or choosing a naming policy; plan 10 owns policy.
- A scheduler owner, persistence, server queue/receipt implementation, or capability contract changes; plan 08 owns the published server contract.
- Replacing or duplicating `CommandQueue`, changing ordinary queue semantics, stopping after errors, or inferring origin from command text or tab label.
- Terminal-generation policy beyond ensuring an outstanding receipt is released and not passed to a replacement consumer.
