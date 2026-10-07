# Record disabled plugin failures as notifications

## Complexity

2/10 — the host already emits a `plugin-failure` notification and a focused test covers the queue. This closes a coverage gap and makes both functional specs describe that existing behavior accurately.

## Goal

Every fatal tab-plugin failure is recorded as an explicit notification, even when the notifications feed is closed. The event catalog and plugin failure spec describe its feed, toast, and burst behavior.

## Approach

Keep the existing host implementation. Add a regression test that checks the queued notification's event type, source tab, and exact disabled message. Update `notifications.md` to list `plugin-failure` among notification events and explicit events. Update `tab-plugins.md` to connect fatal disablement with the ordinary notification delivery behavior.

## Implementation steps

1. Add a focused assertion test to `src/plugins/failure.test.ts` that a failure is recorded as a `plugin-failure` notification while the feed remains closed.
2. Update `product/specs/notifications.md` and `product/specs/tab-plugins.md` to describe fatal failure notifications and their normal delivery behavior.
3. Remove the resolved item from `product/backlog/issues.md`, promote this plan to `product/plans/complete/`, and run `./scripts/run.mjs check-diff` after each change.

## Tests

- `src/plugins/failure.test.ts` — verify the notification queue receives the `plugin-failure` event with its source and formatted failure message while the feed remains closed.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing plugin activation, disablement, or notification delivery behavior, which is already implemented.
- Changing when the notifications feed opens or how notification bursts are escalated.
- Updating public help or user documentation, which does not describe this failure behavior.
