# System schedules 05: server-owned per-command queue provenance

**Complexity: 6/10**

This changes queue representation and one-shot receipt ownership across runtime, dispatch and plugin capabilities while preserving legacy string APIs. Shell adaptation, naming policy and schedule production are separate consumers, not part of this contract change.

## Goal

Preserve system-schedule provenance through server queue storage and the guarded shell dispatch contract, without inferring it from the system tab's label. Source: `product/plans/ready/add-system-schedules.md`, especially system-fired harness name clashes.

## Decisions and dependencies

- Dependencies: 01 and 04 for managed identity and schedule-key types. The transport is usable independently of the future owner.
- Internal queued rows accept existing strings and structured rows `{ line, origin: { kind: 'system-schedule', scheduleKey } }`. Strings represent ordinary queued work. Keep metadata on the owning tab's runtime, never a manager-wide `Map<label,...>`, command text marker, client-authored origin flag, or mutable ambient execution context.
- Preserve outward `TabView.commandQueue: string[]`, `queueFor`, ordinary enqueue/dequeue, empty-row behavior, and existing plugin `queueLine`/`nextQueuedLine` contracts. Legacy dequeue returns the text only and releases any metadata. Editing a structured row replaces it with an ordinary string, deliberately dropping scheduled provenance; deleting drops it. No queue state is persisted.
- Add two narrow host capabilities: `nextQueuedCommand()` returns `{ line, receipt } | null`; `dispatchQueuedCommand(receipt, options?: { discard?: true })` consumes that owned receipt once and either dispatches the stored line through the one ordinary command pipeline or discards it. The host owns the exact line and origin; a client/plugin cannot attach origin to arbitrary text. Receipts are opaque, scoped to plugin ownership, tab incarnation, and dequeued row. Invalid/reused/cross-tab execution receipts are domain rejections. Discard is idempotent for already consumed/absent receipts and can never affect a different tab's receipt.
- Outstanding receipts live on `TabRuntime` and are released on consume/discard/tab teardown. Stop/disable releases them too. Client 06 must discard on shell/intercept/error paths; test abandoned consumers and repeated reconnects so receipt state cannot grow without bound (invalidate stale outstanding work at attachment/incarnation teardown rather than executing it later). A new application process always starts with fresh local tabs, queues and receipts; automatic remote reattachment must not restore local queue metadata or make an old receipt valid for a new incarnation.
- Add optional readonly `systemSchedule` provenance to `CommandInvocationContext`, populated only from the consumed server receipt. Ordinary `dispatchLineWithOutput`, typed commands, manual `execute`, `send`, `queue`, and profile paths have none. Preserve it in child invocation contexts when continuing the same scheduled command, but profile harness opening still uses its explicit-name path.
- These are additive capabilities under plugin API v2. Keep the old methods and frozen v1 fixtures; declarations must request each new capability. No new RPC, socket, or raw `Managers` grant to a concrete plugin.

## Existing code to reuse

`src/tab/{queue,queue-commands,queue-state,runtime}.ts`, `command-queue/support.ts`, `plugins/{line-capabilities,own-tab,context}.ts`, and `CommandManager.dispatchLine`/`createInvocationContext` own the relevant seams. Receipt dispatch reuses the registry, capture limits, transcript attribution, and guarded host-time exemption.

## File scope

- New `src/command-queue/{entry,receipts}.ts`; `src/tab/{types,runtime,queue,queue-commands,queue-state,view}.ts`; `src/command-queue/support.ts`; `src/commands/types.ts`; `src/command/manager.ts`; anticipated extract `src/command/invocation-context.ts` for immutable context creation/copying; `src/plugins/{api,api-capabilities,line-capabilities,context}.ts`; anticipated `src/plugins/queue-capabilities.ts` to keep the capability group small. Move importers directly if an extract moves a symbol.
- Concrete shell intents are connected in 06, not changed here. Test-only plugin declarations may request the new capabilities now. Keep the existing queue opt-in pair authoritative.
- Tests: existing `src/command-queue/{support,plugin-opt-in}.test.ts`, `src/tab/{manager,view,runtime-operations}.test.ts`, `src/command/{manager,immediate-dispatch}.test.ts`, `src/plugins/{shell-capabilities,host,context,teardown,dispatch-deadline}.test.ts`; new colocated entry/receipt/invocation-context tests, `src/tab/{queue,queue-commands,queue-state}.test.ts`, `src/plugins/queue-capabilities.test.ts` if extracted, and `src/command-queue/provenance.integration.test.ts`. Existing frozen server/client tests are `src/plugins/fixture-v1/compatibility.test.ts` and `web/src/plugins/fixture-v1/compatibility.test.tsx`; run without editing fixture implementations.
- Specs/docs: `product/specs/{command-queue,tab-plugins}.md`, `documentation/developer-documentation/tab-plugins.md` API reference and additive changelog entry. Name the two methods, validation, ownership, discard lifecycle, and legacy behavior.

## Ordered changes

1. Introduce internal row normalization and string projection. Migrate every queue helper, runtime accessor, view builder and popup-edit path together; retain string inputs for old fixtures/callers.
2. Implement per-tab receipt lifecycle and one-time consume/discard, including incarnation checks and cleanup. Add the optional immutable invocation provenance and preserve it through child contexts.
3. Publish declared capabilities and wire them through the existing own-tab checks and command capture route. Keep old capability behavior and host deadline exemptions.
4. Add integration/compatibility tests and document the contract before 06 consumes it.

## Tests and verification

Cover mixed ordinary/system rows, FIFO identity with identical text, string-only projection, edit/delete metadata behavior, legacy dequeue, receipt ownership, malformed/replayed/stale receipts, closed/reused labels, disabled plugin behavior, cleanup, concurrent requests, immutable context copying, and unchanged output capture/concurrency rules.

Run `./scripts/run.mjs check-diff`. Scope E2E: use a real controller and guarded test plugin to enqueue a structured row, dequeue over its declared capability, dispatch through the real registry, and inspect the command's received context and transcript. Interleave an ordinary submission and prove it receives no provenance. Exercise the legacy plugin route in the same test. Run frozen compatibility tests explicitly if diff-scoped selection omits them. No browser UI is needed for this server-only seam; 06 verifies the client half.

## Boundaries

No new queue consumer, scheduler, postfix decision, or change to typed/profile launches. This plan is the server transport contract. 06 delivers shell client integration; 07 alone interprets provenance for harness naming; 08 alone creates scheduled rows.
