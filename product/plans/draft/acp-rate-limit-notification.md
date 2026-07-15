# Notify on ACP query rate limiting

## Summary

When an ACP query fails because the underlying provider is rate limiting requests, a notification is recorded to the notifications tab, in addition to the existing in-tab error line that already appears today. This covers both places an ACP query can fail: an agent tab's interactive `acp <prompt>` command (`src/acp/manager.ts`) and a monitor persona's background session (`src/monitor/acp.ts` / `src/monitor/session.ts`). Since the ACP protocol and its underlying agent adapters carry no structured "rate limited" error code, detection is a best-effort match against the failure's error-message text for a small set of known rate-limit markers.

## Design decisions

1. **Scope: both ACP query paths.** Rate-limit detection wraps every place an ACP query's failure is currently surfaced as a plain error message — the interactive `acp` command path and monitor persona sessions — so any rate-limited query notifies, regardless of which of the two started it.
2. **Detection: phrase/code matching on the error message.** A single shared helper takes the failure's message string and returns whether it looks like a rate-limit failure, matching a small, case-insensitive set of markers (e.g. `429`, `rate limit`, `too many requests`). Anything not matching one of these markers is treated as a generic ACP error, exactly as today — no other behavior changes for non-rate-limit failures.
3. **Additive, not replacing.** The existing in-tab error line (`ACP: <message>` for the interactive path, `monitor <persona>: <message>` for monitor sessions) is left completely untouched. The rate-limit check runs alongside it and, on a match, additionally calls into the notification system — nothing about the existing error-rendering path changes.
4. **New ambient notification event.** Rate limiting becomes a new `NotificationEventType` value (e.g. `'rate-limited'`), following the same ambient-event shape as `state-change`/`agent-start`/`incoming-message`/`schedule-fire`: it respects the notifications config's per-event opt-in and the active-tab focus-suppression rule in `shouldNotify` (an actively-focused tab's own rate limiting doesn't need a separate notification since the user is already looking at the error), rather than bypassing both the way `manual`/`auto-approve` do.
5. **Wording.** The notifications-tab line reads `Agent '<label>' is being rate limited`, matching the existing `Agent '<label>' <verb>` phrasing already used for `agent-start` (`Agent '<label>' started`) and `state-change` (`Agent '<label>' finished`).

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `notify` / `NotificationEventType` / `notificationText` / `shouldNotify` | `src/notifications.ts` | The entire ambient-notification pipeline this feature plugs into; a new event value and its `notificationText` case and `shouldNotify` config check are added following the exact pattern the four existing events already use. |
| `NotificationConfig.events` | `src/types.ts` | Gains a new boolean toggle for the new event, alongside `stateChange`/`incomingMessage`/`scheduleFire`/`agentStart`. |
| Interactive ACP error handling | `src/acp/manager.ts` (`run()`'s `error:` callback, line ~121) | Already calls `notify(this.managers, 'state-change', label)` on any ACP error; the rate-limit check runs here first and, on a match, also calls `notify(this.managers, 'rate-limited', label)`. |
| Monitor ACP error handling | `src/monitor/session.ts` (`onError`), `src/monitor/manager.ts` (line ~171), `src/monitor/ask.ts` | Each already appends an error line on ACP failure; the same rate-limit check is added at whichever of these is the actual terminal handler for a monitor query's failure, calling `notify` the same way. |
| Underlying error surfacing | `src/acp/index.ts` (`connectAcp`'s `prompt`, `handlers.onError`) | Confirms failures arrive as a single message string with no structured code — the reason detection has to be a text match rather than a status check. |

## Proposed changes

1. **`src/notifications.ts`**: add `'rate-limited'` to `NotificationEventType`; add a `case 'rate-limited':` to `shouldNotify` reading a new config toggle; add a `case 'rate-limited':` to `notificationText` returning `` `Agent '${tabLabel}' is being rate limited` ``.
2. **`src/types.ts`**: add a new boolean field to `NotificationConfig['events']` (e.g. `rateLimited`) alongside the existing four.
3. **New shared helper** (e.g. `src/acp/rate-limit.ts`, exporting `isRateLimitError(message: string): boolean`): a case-insensitive check of the message against the agreed marker set (`429`, `rate limit`, `too many requests`, and any other markers confirmed useful during implementation).
4. **`src/acp/manager.ts`**: in `run()`'s `error:` callback, call the new helper on `m`; when it matches, additionally call `notify(this.managers, 'rate-limited', label)` before/after the existing `notify(this.managers, 'state-change', label)` call — the existing call and the appended error line are unchanged.
5. **Monitor path** (`src/monitor/session.ts`, `src/monitor/manager.ts`, `src/monitor/ask.ts` — whichever owns the terminal `onError` for a monitor query): the same helper is called on the error message, and on a match, `notify(managers, 'rate-limited', reg.owner)` (or the equivalent owning tab label already used for that path's existing error append) is called, additively.
6. **Config defaults**: wherever `NotificationConfig` is given a default value (config.ts or similar), the new `rateLimited` toggle gets a sensible default (on, matching the other ambient events' likely default) — confirmed against however the other four are defaulted today.
7. **Spec update**: `product/specs/notifications.md` gains the new event to its list of ambient events and its config toggle, and documents the wording and detection scope (both ACP query paths, phrase-matched, additive to the existing in-tab error).

## Tests

- `src/acp/rate-limit.test.ts` (new): `isRateLimitError` returns true for messages containing `429`, `rate limit`, `too many requests` (and case-insensitive variants), and false for an unrelated ACP error message.
- `src/notifications.test.ts`: `notificationText('rate-limited', label)` returns the expected wording; `shouldNotify` respects the new config toggle and the existing focus-suppression rule for the new event, the same way it's tested for the existing four ambient events.
- `src/acp/manager.test.ts`: a query failing with a rate-limit-shaped message triggers both the existing error append/`state-change` notify and a new `rate-limited` notify call; a query failing with an unrelated error message triggers only the existing behavior (no `rate-limited` notify).
- Monitor-path equivalent test (wherever the existing monitor-error tests live, e.g. `src/monitor/manager.test.ts` or `src/monitor/session.test.ts`): same rate-limit-vs-generic-error distinction for a monitor persona's failing query.

## Out of scope

- Any change to the existing in-tab error line's content or format for either path.
- Retrying, backing off, or otherwise altering how a rate-limited query is handled beyond notifying — the query still fails exactly as it does today.
- A structured rate-limit error code from the ACP SDK or agent adapters (none exists to consume).
- Debouncing or coalescing repeated rate-limit notifications from the same tab — each failure notifies independently, same as every other ambient event today.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: with the notifications tab open and the failing tab not focused, trigger an `acp <prompt>` query against a stubbed/forced failure whose message contains `429` (or run against a real provider until it rate-limits) and confirm both the existing in-tab error line and a new `Agent '<label>' is being rate limited` notifications-tab line appear. Repeat with a monitor persona query failing the same way, and separately confirm a non-rate-limit ACP error produces only the existing behavior with no new notification.
