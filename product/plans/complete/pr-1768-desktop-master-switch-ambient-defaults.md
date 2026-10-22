# Direct tests for desktop master and ambient alert defaults

**Complexity: 2/10** — two focused cases in the existing native notification test suite; no production behavior changes.

## Goal

Pin the separation between notification queue delivery and optional native alerts: disabling the desktop master switch suppresses an enabled per-type banner, and opting an ambient event into the feed does not override that event's default alert settings.

## Approach

Add two independent cases to `src/notifications/native.test.ts`. The master-switch case configures `manual` with `desktop: true` and `sound: 'none'`, turns `osNotifications` off, and verifies the notification is queued without a native event. The ambient case enables `stateChange` while leaving the `state-change` alert entry at its default, and verifies it is queued without a native event. Retain the existing test for explicitly configured ambient alerts and the current master-switch coverage.

## Implementation steps

1. In `src/notifications/native.test.ts`, add direct regression cases for the disabled desktop master with an enabled banner and no sound, and for an opted-in ambient event with the default alert entry.
2. Keep each case explicit about the queue result and absence of a native notification event so the separate delivery paths remain covered.

## Tests

- `src/notifications/native.test.ts`: two new cases, covering master-switch suppression of an enabled banner while queueing the notification, and feed opt-in for an ambient event while default alert settings suppress native delivery.
- Existing configured ambient opt-in and master-switch cases continue to pass.

## Spec and documentation

- `product/specs/notifications.md` already specifies that the master switches govern configured alerts independently and that ambient alert defaults are disabled. Verify the tests match those behaviors; no spec wording change is needed.
- No user documentation change is needed because this adds regression coverage without changing behavior.

## Out of scope

- Production notification delivery code or configuration defaults.
- Other event types, alert combinations, notification surfaces, and PR description changes.
