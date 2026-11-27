# feat: add the mcpPort config key and the two MCP notification kinds

**Complexity: 3/10** — ~24 added lines, 5 files, 3 requirements (p=4.64)

## Goal

Lay the two small, additive pieces the local MCP manager needs: a hand-edited `mcpPort` config key that overrides the persisted port, and the two new notification kinds (`mcp-failed` and `question-withdrawn`) with their exact rendered text. Both are inert until a consumer uses them, so this subplan is independently green and keeps later subplans free of breaking type edits.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on no earlier subplan.

## Requirements

1. An `mcpPort` config key overrides the saved port — user answer: "An `mcpPort` config key can override it."
2. A server that cannot start records one notification `MCP server failed to start: <reason>` — user answer: "Notify; launch w/o MCP": "records one notification, e.g. `MCP server failed to start: <reason>`."
3. Withdrawing a question records the notification `Question from <tab> withdrawn` — user answer: "also record a notification `Question from <tab> withdrawn`".

Requirement 3 is shared with `janissary-mcp-server-4-local-question-executor.md`: this subplan defines the kind and its text, that one emits it on abort.

## Design decisions

- `mcpPort` is optional and is not written into a fresh config: it is deliberately excluded from `backfillMissingKeys`, unlike the keys that are written out. A value that is not an integer from 1 to 65535 is treated as absent, so the saved port applies. User answer: "Pick free once, persist".
- The two new events are explicit notifications, not ambient ones: a failure and a withdrawal must be visible even on the active tab. The union additions therefore need a classification in `EXPLICIT_EVENTS`, a case in `notificationText`, and default alert entries in `NOTIFICATION_ALERT_DEFAULTS` before the tree compiles; all three records are keyed by the union and are edited in this subplan.
- `question-withdrawn` is recorded only by the MCP executor's abort path; a tab close or a user Cancel resolves without the caller's signal aborting, so neither records it.

## Preserved behavior

None found.

## Assumptions

1. A new member of `NotificationEventType` lands automatically in `ExplicitNotificationEvent` and fails `EXPLICIT_EVENTS` until classified — `src/notifications/index.ts:56` `export type ExplicitNotificationEvent = Exclude<NotificationEventType, AmbientNotificationEvent>;`.
2. `notificationText` renders each event's message from a switch over the same union — `src/notifications/format.ts:43` `export function notificationText(event: NotificationEventType, tabLabel: string, detail?: string): string`.
3. Config decoding is centralized in `decodeConfig`, with a small set of typed value helpers — `src/config-decode.ts:116` `export function decodeConfig(value: unknown, defaults: Config): Config`.
4. `backfillMissingKeys` writes only a named subset of keys into a fresh config — `src/config-decode.ts:107` `export function backfillMissingKeys(parsed: unknown, defaults: Config): Record<string, unknown> | undefined`.
5. Default alert settings are keyed by the same notification union, so a new kind has no defaults until one is added — `src/notifications/alert-defaults.ts:7` `export const NOTIFICATION_ALERT_DEFAULTS: Record<NotificationEventType, NotificationAlert> = {`.

## Existing functionality

1. Atomic config writes with a create mode — `src/atomic-write.ts:9` `export function atomicWriteFile(`.
2. Typed config value decoders including a bounded integer — `src/config-decode.ts:23` `function positiveIntegerValue(`.
3. The notification kind union and its exhaustive explicit-event table — `src/notifications/index.ts:8` `export type NotificationEventType =` and `src/notifications/index.ts:76` `export const EXPLICIT_EVENTS`.
4. The pure notification text renderer — `src/notifications/format.ts:43` `export function notificationText(`.
5. The default alert table keyed by the notification union — `src/notifications/alert-defaults.ts:7` `NOTIFICATION_ALERT_DEFAULTS`.

## Implementation steps

1. Add an optional `mcpPort?: number` key to `Config` in `src/config.ts` with a comment that it is hand-edited and overrides the persisted MCP port. In `src/config-decode.ts`, add a bounded integer helper (integer from 1 to 65535, otherwise absent) and decode `mcpPort` in `decodeConfig`; do not add it to `BACKFILLED_KEYS`. Update `product/specs/application-config.md` with the new key. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Add `mcp-failed` and `question-withdrawn` to `NotificationEventType` in `src/notifications/index.ts` and classify both as explicit in `EXPLICIT_EVENTS`. In `src/notifications/format.ts`, add a case for `mcp-failed` returning `detail` and a case for `question-withdrawn` returning `Question from ${tabLabel} withdrawn`. In `src/notifications/alert-defaults.ts:7`, add a default entry for each new kind (desktop `true`, sound `error` for the failure and `warning` for the withdrawal) so `NOTIFICATION_ALERT_DEFAULTS` stays exhaustive. Update `product/specs/notifications.md` with both kinds. Nothing emits them yet, so no behavior changes. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit; `src/notifications/index.ts` and `src/config-decode.ts` gain only a few lines. Relative imports in `src/` carry the `.js` extension per NodeNext.

## UI design

1. This subplan adds no new surface. `mcp-failed` and `question-withdrawn` appear as lines in the existing notifications feed, and the `mcpPort` key is hand-edited in `.janissary/config.json`.

## Tests

- A config-decoding test in `src/config.test.ts`, where the existing config-decoding cases live: an integer from 1 to 65535 is read as `mcpPort`; `0`, a fraction, a non-number, and out-of-range values leave it absent; `backfillMissingKeys` never writes it (requirement 1).
- A notification-format test beside the existing `src/notifications/format.test.ts` cases: `mcp-failed` renders its detail verbatim and `question-withdrawn` renders `Question from <tab> withdrawn` (requirements 2, 3).

## Out of scope

- Reading or writing `.janissary/mcp.json`: that is `janissary-mcp-server-5-local-server-manager.md`.
- Emitting either notification: the manager and the executor emit them in later subplans.
- Changing existing notification kinds or config keys.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then read `src/config.ts`, `src/config-decode.ts`, `src/notifications/index.ts` and `src/notifications/format.ts`: confirm `mcpPort` is optional and absent from `BACKFILLED_KEYS`, both new kinds are in `EXPLICIT_EVENTS`, and each has a `notificationText` case. A failure is a compile error from an unclassified event or a key that silently appears in a fresh config.
