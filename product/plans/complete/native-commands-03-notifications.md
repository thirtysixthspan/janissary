# Native commands: disabled notification

**Complexity: 3/10** — adding an ambient notification spans configuration and protocol but follows existing event patterns.

## Goal

Provide the shared, tab-attributed disabled-command notification for all later refusal paths.

## Decisions and dependencies

- Depends on the inventory and service work units. Notification visibility never determines policy or the returned refusal.
- The exact refusal is `Command is disabled: <command>.` Use a `command-disabled` ambient event attributed to the originating tab. Its `notifications.events.commandDisabled` setting defaults to false, with alert defaults matching other ambient events; existing focus suppression, feed, and toast behavior apply.

## Existing code to reuse

| Need | Existing implementation (reuse, don't rebuild) |
| --- | --- |
| Event classification, focus/toggle gate, and delivery entry point | `src/notifications/index.ts:8` (`NotificationEventType`), `:46` (`AmbientNotificationEvent`), `:59` (`AMBIENT_EVENTS`), `:146` (`shouldNotify`), and `:191` (`notify`). Call `notify(managers, 'command-disabled', tabLabel, message)` after the refusal is decided; do not add another delivery API. |
| Message rendering and surfaces | `src/notifications/format.ts:43` (`notificationText`) and `src/notifications/deliver.ts:37` (`deliverNotification`); accepted events already enter the queue/record/feed and eligible toast/native-alert paths. |
| Alert defaults, settings type/defaults, and decode | `src/notifications/alert-defaults.ts:7` (`NOTIFICATION_ALERT_DEFAULTS`), `src/config.ts:14` (`NotificationConfig`) and `:95` (defaults), and `src/config-decode.ts:56` (`notifications`). |
| Wire delivery | `src/protocol/events.ts:62` (`NativeNotificationEvent`) and `src/protocol.ts:146` (`NativeNotificationEvent` export). This generic notification transport carries the rendered message; no new wire field or event envelope is needed. |
| Test and behavior precedent | `src/notifications/index.test.ts:34` (exhaustive classification, policy, and formatting coverage), `:117` (ambient behavior), `src/notifications/native.test.ts:114` (ambient alert gating), `src/config.test.ts` (config decoding), and `product/specs/notifications.md:285` (ambient toggle/focus rules). |

## Proposed changes

1. Add `command-disabled` to `NotificationEventType` and `AmbientNotificationEvent`, map it to `commandDisabled` in `AMBIENT_EVENTS`, and render the supplied detail verbatim in `notificationText`. The caller supplies exactly `Command is disabled: <command>.`, using the canonical command name selected by the command-policy work; do not reconstruct or normalize it in the notification layer. Keep ambient active-tab suppression and notification-feed self-suppression unchanged.
2. Add `commandDisabled: boolean` to `NotificationConfig['events']`, default it to `false` in `src/config.ts`, and decode it with the existing boolean fallback pattern in `src/config-decode.ts`. Give `command-disabled` the ambient alert default `{ desktop: false, sound: 'none' }`; do not add a protocol event field because `NativeNotificationEvent` already carries the message through the common notification transport.
3. Reuse `notify` as the narrow entry point from the later refusal path, passing the originating tab's label and exact refusal message only after policy has decided to refuse. Notification suppression or delivery must not affect the refusal result, and no refusal behavior/dispatch changes belong in this plan. The inventory and service work units must land first; this adds only the shared event/config/delivery foundation for later refusal paths.
4. Update `product/specs/notifications.md` to list the new ambient event, its exact message, default-off toggle, focus suppression, and default-muted alert behavior. Update `product/specs/application-config.md` with the `notifications.events.commandDisabled` setting and its default. Do not alter unrelated refusal or command behavior.

## Tests

In `src/notifications/index.test.ts`, cover exhaustive event classification, exact message formatting, tab attribution, toggle-off/default-off and explicit opt-in, active-tab suppression, notification-feed self-suppression, and that an eligible background event reaches ordinary feed/toast delivery. In `src/notifications/native.test.ts`, assert the default-muted alert and opt-in behavior; in `src/config.test.ts`, cover decoding the explicit toggle and fallback when it is missing or malformed. Test refusal return-value independence at the later refusal-path integration, not by inventing a notification-layer refusal API here.

## Verification

Run `$janissary/scripts/run.mjs check-diff` during development and focused notification/configuration tests. For a manual end-to-end check, opt in with `notifications.events.commandDisabled: true`, issue a disabled command from an inactive tab and confirm the exact refusal appears as a tab-attributed notification; repeat with the toggle off and with the originating tab active, confirming notification suppression does not change the refusal outcome.

## Out of scope

Changing dispatch behavior or creating agent access controls is covered by subsequent plans.
