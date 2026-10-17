# System schedules 08: server-owned per-command queue provenance

**Complexity: 6/10** — one server-owned queue representation change crosses tab runtime, plugin capabilities and command invocation context, with lifecycle and compatibility tests.

This changes queue representation and one-shot receipt ownership across runtime, dispatch and plugin capabilities while preserving legacy string APIs. Shell adaptation, naming policy and schedule production are separate consumers, not part of this contract change.

## Goal

Preserve system-schedule provenance through server queue storage and the guarded shell dispatch contract, without inferring it from the system tab's label. Source: `product/plans/ready/add-system-schedules.md`, especially system-fired harness name clashes.

## Decisions and dependencies

- Dependencies: 01 and 07 for managed tab incarnation and schedule-key types. The transport can be implemented before its future producer in 11.
- Internally, queue rows accept legacy strings and structured `{ line, origin: { kind: 'system-schedule', scheduleKey } }` entries. Strings mean ordinary work. Store rows and outstanding receipts on the owning tab runtime, never in a manager-wide label map, command-text marker, client-authored origin flag, or mutable ambient execution context.
- Keep `TabView.commandQueue: string[]`, `queueFor`, ordinary enqueue/dequeue, empty-row behavior, and `queueLine`/`nextQueuedLine` unchanged. Legacy dequeue returns only text and releases metadata. Editing a structured row replaces it with an ordinary string and drops provenance; deletion drops it. No queue or receipt is persisted.
- Add two separately declared host capabilities alongside, not in place of, the existing queue opt-in pair. `nextQueuedCommand()` returns `{ line, receipt } | null`. `dispatchQueuedCommand(receipt, options?: { discard?: true })` either dispatches the host-stored line through the ordinary application-or-shell route or discards it. The host owns both line and origin; the caller cannot assign provenance to arbitrary text. Receipts are opaque and valid only for their issuing plugin, tab incarnation and dequeued row. Invalid, replayed, cross-plugin, cross-tab and stale-incarnation execution attempts return a domain rejection without disabling the plugin.
- Keep only outstanding receipts, keyed by unguessable host-minted identifiers, on `TabRuntime`; no consumed-receipt tombstones are needed because an absent identifier cannot execute. Cap outstanding receipts at 256 per tab. At capacity, `nextQueuedCommand()` rejects with a domain rejection and leaves the queue unchanged. Consume and discard remove the receipt before any dispatch side effect; dispatch failure still consumes it. Discarding an already absent receipt succeeds as a no-op, without lookup or mutation of another tab. This bounds abandoned receipt state while making replay invalid.
- Release outstanding receipts when consumed, discarded, the plugin is disabled, or the owning tab incarnation is closed. Plan 09 owns client-held receipt cleanup when its consumer is disposed and must discard when interception, shell handling, or an error means a dequeued command will not be dispatched. A reattached remote tab never restores local queue rows or receipts; a new tab incarnation cannot validate an old receipt.
- Add optional readonly `systemSchedule` provenance to `CommandInvocationContext`, populated only while dispatching a consumed server receipt. Ordinary `dispatchLineWithOutput`, typed commands, manual `execute`, `send`, `queue`, and profile paths receive none. Preserve it in child invocation contexts for the same scheduled command; profile harness opening retains its explicit-name path. Capture provenance in the invocation object at dispatch entry, not through ambient state.
- The capabilities are additive under plugin API v2; keep the old methods and frozen v1 fixture unchanged. Each new capability is enforced by the existing declaration allowlist and requested by name. No new RPC/socket, client adapter, or raw `Managers` grant to a concrete plugin.

## Existing code to reuse

`src/tab/{queue,queue-commands,queue-state,runtime}.ts` own string storage and mutations; `src/tab/view.ts` and `src/command-queue/support.ts` own the outward projection and declaration-based queue availability. `src/plugins/{line-capabilities,own-tab,context,api,api-capabilities}.ts` own the existing capability scope and v2 contract. `src/command/manager.ts` owns `dispatchLineWithOutput`, `dispatchLineInInvocation`, and immutable context construction/copying. Reuse the one registry/shell routing, command capture, transcript attribution and host-time deadline exemption; do not create a second dispatcher.

## File scope

- Sources: new `src/command-queue/{entry,receipts}.ts`; update `src/tab/{types,runtime,queue,queue-commands,queue-state,view}.ts`, `src/command-queue/support.ts`, `src/commands/types.ts`, `src/command/manager.ts`, and `src/plugins/{api,api-capabilities,line-capabilities,context}.ts`. Extract immutable context helpers to `src/command/invocation-context.ts` or the queue capability group to `src/plugins/queue-capabilities.ts` only if the source would exceed the 200-line lint-counted limit; move imports directly, without barrels. Use NodeNext `.js` extensions.
- Tests: update `src/command-queue/{support,plugin-opt-in}.test.ts`, `src/tab/{manager,view,runtime-operations}.test.ts`, `src/command/{manager,immediate-dispatch}.test.ts`, and `src/plugins/{shell-capabilities,host,context,teardown,dispatch-deadline}.test.ts`; add colocated queue-entry, receipt, context and `src/command-queue/provenance.integration.test.ts` coverage as modules warrant. The unchanged frozen fixtures to run are `src/plugins/fixture-v1/compatibility.test.ts` and `web/src/plugins/fixture-v1/compatibility.test.tsx`.
- Specs/docs: update `product/specs/command-queue.md` and `product/specs/tab-plugins.md`, plus `documentation/developer-documentation/tab-plugins.md` API reference and its additive API changelog. Document exact method contracts, declared capability requirements, validation/rejection, capacity, ownership, lifecycle, and legacy behavior. No client adapter or consumer documentation belongs here.

## Ordered changes

1. Introduce internal row normalization and the string projection. Migrate every string API, `queueFor`/view path, and popup edit/delete operation together. Preserve legacy string callers and ensure edits/deletes clear metadata.
2. Add bounded per-tab receipts and consume/discard behavior. Resolve the owning tab from the plugin's answering/origin context using the established `ownTabLabel` rule; check plugin id and tab incarnation before consuming. Route dispatch through the same ordinary dispatcher and capture pipeline. Add immutable invocation provenance and child-context copying.
3. Publish the optional v2 capabilities and expose them only through the declared-capability filter and own-tab check. Keep the old queue capability pair and its behavior authoritative for legacy callers, and preserve existing host-time deadline exemptions.
4. Add lifecycle, concurrency, compatibility and provenance tests; update specs and developer API reference/changelog before plan 09 consumes the contract.

## Tests and verification

Cover mixed ordinary/system rows, FIFO identity for identical text, string-only projection, edit/delete provenance removal, empty rows, legacy dequeue/re-enqueue behavior, receipt capacity and ownership, malformed/replayed/stale receipts, closed or reused labels, cross-plugin calls, disabled plugins, discard idempotence, cleanup on every tab/plugin lifecycle path, concurrent dequeue/consume, immutable child-context copying, and unchanged output capture/concurrency rules. Verify no receipt or origin appears in `TabView`, RPC/wire types, or persisted state.

Run `./scripts/run.mjs check-diff` during implementation. For this plan-only edit, use `git diff --check -- product/plans/draft/system-schedules-08-server-queue-provenance.md`; the diff-scoped code checks have no applicable source files. Manual server-side integration check: use a real controller and guarded test plugin to enqueue a structured row, dequeue using both declared receipt capabilities, dispatch through the real registry, and inspect command context and transcript; interleave ordinary dispatch and prove it has no provenance. Exercise legacy `queueLine`/`nextQueuedLine` in the same check, including edit/delete and disabled-plugin paths. Run frozen compatibility tests explicitly if diff selection omits them. No browser/UI check is in scope; plan 09 verifies the client half.

## Boundaries

No client adapter or shell consumer, scheduler/producer, postfix decision, or change to typed/profile launches. This plan supplies only the server transport and plugin-host contract. Plan 09 delivers client shell integration; 10 alone interprets provenance for harness naming; 11 alone creates scheduled rows.
