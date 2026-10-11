# Release failed message-bus listeners during teardown

Complexity: 3/10

## Goal

Release failed listener callbacks from the message bus's error-deduplication state when their subscriptions end, including teardown during an active dispatch, and when the bus is cleared.

## Approach

Keep the listener registry and error-deduplication registry in sync across every removal path. Preserve the bus's existing snapshot delivery and once-per-failure reporting for active listeners, but do not retain a callback after its subscription has ended.

## Implementation steps

1. In `src/bus.ts`, update each event type's unsubscribe path in `MessageBus.on` to remove the callback from `reported` as well as `listeners`, and remove empty sets from both maps.
2. In `MessageBus.emit`, preserve reporting when a listener removed during the current snapshot throws, but do not add that detached callback to `reported`; it cannot receive another event.
3. In `MessageBus.clear`, clear both maps.

## Tests

- `src/bus.test.ts`: verify a failed listener can report again after unsubscribe and resubscribe, and after `clear()` and resubscription.
- `src/bus.test.ts`: verify a listener removed by an earlier listener during snapshot dispatch still runs and its failure is reported without remaining registered for error deduplication; keep the existing repeated-failure test to confirm active listeners remain deduplicated.
- Run `./scripts/run.mjs check-diff` after the plan, implementation, and test changes.

## Spec and documentation

Create `product/specs/message-bus.md` to record the event delivery and listener error reporting contract, including how the contract behaves when a subscription ends or the bus is cleared. Help and public documentation do not describe this internal service.
