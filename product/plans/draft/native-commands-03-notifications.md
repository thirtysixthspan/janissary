# Native commands: disabled notification

**Complexity: 3/10** — adding an ambient notification spans configuration and protocol but follows existing event patterns.

## Goal

Provide the shared, tab-attributed disabled-command notification for all later refusal paths.

## Decisions and dependencies

- Depends on the inventory and service work units. Notification visibility never determines policy or the returned refusal.
- The exact refusal is `Command is disabled: <command>.` Use a `command-disabled` ambient event attributed to the originating tab. Its `notifications.events.commandDisabled` setting defaults to false, with alert defaults matching other ambient events; existing focus suppression, feed, and toast behavior apply.

## Existing code to reuse

`src/notifications/index.ts`, `src/notifications/format.ts`, `src/config-decode.ts`, configuration types/defaults, `src/protocol.ts`, and existing ambient notification tests and `product/specs/notifications.md`.

## Proposed changes

1. Extend the event union, ambient classification, formatter, alert defaults, configuration types/defaults/decode, and wire definitions as needed using the existing event lifecycle.
2. Expose or reuse a narrow notification entry point for a later refusal to provide the originating tab and canonical command; don't couple policy to notification delivery.
3. Update notification and configuration specs for the new setting and suppression behavior.

## Tests

Cover exact formatting, tab attribution, default-off and explicit configuration, ambient alert defaults, active-tab focus suppression, and feed/toast delivery when eligible. Include proof that suppression does not alter a refusal value.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and focused notification/configuration tests.

## Out of scope

Changing dispatch behavior or creating agent access controls is covered by subsequent plans.
