# Notify on ACP query rate limiting

**Complexity: 3/10** — one new pure helper, one new notification event following an existing four-event pattern exactly, and wiring into three existing error call sites; no new protocol surface, no persistence, no concurrency.

## Summary

When an ACP query fails because the underlying provider is rate limiting requests, a notification is recorded to the notifications tab, in addition to the existing in-tab error line that already appears today. This covers every place an ACP query's failure is currently surfaced with a visible in-tab error line: an agent tab's interactive `acp <prompt>` command (`src/acp/manager.ts`), a monitor persona's periodic background query (`src/monitor/manager.ts`'s `flush()`), and a direct `monitor ask <persona> <question>` (`src/monitor/ask.ts`). Since the ACP protocol and its underlying agent adapters carry no structured "rate limited" error code, detection is a best-effort match against the failure's error-message text for a small set of known rate-limit markers.

Two other ACP error sites exist in `src/monitor/session.ts` but are deliberately not wired up — see decision 6.

## Design decisions

1. **Scope: every ACP query path with a visible existing error line.** Rate-limit detection wraps the three real, currently-user-visible ACP-query failure sites: the interactive `acp` command (`src/acp/manager.ts`'s `run()`), a monitor's periodic flush query (`src/monitor/manager.ts`'s `flush()`), and a direct `monitor ask` query (`src/monitor/ask.ts`). So any rate-limited query notifies, regardless of which of these three started it.
2. **Detection: phrase/code matching on the error message.** A single shared helper takes the failure's message string and returns whether it looks like a rate-limit failure, matching a small, case-insensitive set of markers (e.g. `429`, `rate limit`, `too many requests`). Anything not matching one of these markers is treated as a generic ACP error, exactly as today — no other behavior changes for non-rate-limit failures.
3. **Additive, not replacing.** The existing in-tab error line — `` `ACP error: ${m}` `` for the interactive path (`src/acp/manager.ts:121`), `` `monitor ${reg.persona.name}: ${message} — restarting monitor session` `` for a monitor's periodic flush (`src/monitor/manager.ts:172`), and the equivalent line in `askMonitor` (`src/monitor/ask.ts:33`) — is left completely untouched. The rate-limit check runs alongside each, and on a match, additionally calls into the notification system — nothing about the existing error-rendering or respawn behavior changes.
4. **New ambient notification event.** Rate limiting becomes a new `NotificationEventType` value (e.g. `'rate-limited'`), following the same ambient-event shape as `state-change`/`agent-start`/`incoming-message`/`schedule-fire`: it respects the notifications config's per-event opt-in and the active-tab focus-suppression rule in `shouldNotify` (an actively-focused tab's own rate limiting doesn't need a separate notification since the user is already looking at the error), rather than bypassing both the way `manual`/`auto-approve` do.
5. **Wording.** The notifications-tab line reads `Agent '<label>' is being rate limited`, matching the existing `Agent '<label>' <verb>` phrasing already used for `agent-start` (`Agent '<label>' started`) and `state-change` (`Agent '<label>' finished`).
6. **`src/monitor/session.ts`'s two `onError` sites are excluded.** That file has two ACP error callbacks, neither of which is a real "query failing" site in the sense this feature targets: the `spawn(...)`'s connection-level `onError` (`:17`) fires on a subprocess spawn failure (the agent binary never started), before any prompt was ever sent — rate limiting cannot occur here. The persona-priming prompt's `onError` (`:34`) is a real in-flight query that could in principle be rate-limited, but today it does nothing user-visible on failure (only resets `reg.inFlight`, with no `managers.tab.append` call at all) — it is a pre-existing silent-failure gap, not something this feature's "additive to the existing in-tab error" premise (decision 3) can extend, since there is no existing line to be additive to. Fixing that silence is a separate, unrelated gap and is out of scope here (see Out of scope).

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `notify` / `NotificationEventType` / `notificationText` / `shouldNotify` | `src/notifications.ts` | The entire ambient-notification pipeline this feature plugs into; a new event value and its `notificationText` case and `shouldNotify` config check are added following the exact pattern the four existing events already use. |
| `NotificationConfig.events` | `src/types.ts:475-480` | Gains a new boolean toggle for the new event, alongside `stateChange`/`incomingMessage`/`scheduleFire`/`agentStart`. |
| `DEFAULT_CONFIG.notifications.events` | `src/config.ts:16-22` | All four existing ambient toggles default to `false` (opt-in) — the new `rateLimited` toggle follows the same convention and also defaults to `false`, not `true`. |
| Interactive ACP error handling | `src/acp/manager.ts` (`run()`'s `error:` callback, `:121`) | Already calls `notify(this.managers, 'state-change', label)` on any ACP error; the rate-limit check runs here first and, on a match, also calls `notify(this.managers, 'rate-limited', label)`. |
| Monitor periodic-flush error handling | `src/monitor/manager.ts:171-174` (`flush()`'s `reg.session.prompt(...).onError`) | The real terminal handler for a monitor's periodic query failure: appends `` `monitor ${reg.persona.name}: ${message} — restarting monitor session` `` and calls `this.respawn(reg)`. The rate-limit check runs on `message` here, calling `notify(this.managers, 'rate-limited', reg.owner)` on a match — additive, the append and respawn are unchanged. |
| Monitor direct-ask error handling | `src/monitor/ask.ts:32-35` (`askMonitor`'s `reg.session.prompt(...).onError`) | The real terminal handler for a `monitor ask` query's failure: calls `managers.tab.finishRunning(owner, ...)` and `onRespawn()`. Same rate-limit check added here, calling `notify(managers, 'rate-limited', owner)` on a match. |
| Excluded monitor sites | `src/monitor/session.ts:17,34` | Not wired up — see decision 6. `:17` is a connection/spawn-level error (no query was ever sent); `:34` is a real query (the persona-priming prompt) but currently has no visible in-tab error at all to be additive to. |
| Underlying error surfacing | `src/acp/index.ts` (`connectAcp`'s `prompt`, `handlers.onError`) | Confirms failures arrive as a single message string with no structured code — the reason detection has to be a text match rather than a status check. |

## Proposed changes

1. **`src/notifications.ts`**: add `'rate-limited'` to `NotificationEventType`; add a `case 'rate-limited':` to `shouldNotify` reading a new config toggle; add a `case 'rate-limited':` to `notificationText` returning `` `Agent '${tabLabel}' is being rate limited` ``.
2. **`src/types.ts`**: add a new boolean field to `NotificationConfig['events']` (e.g. `rateLimited`) alongside the existing four.
3. **New shared helper** (e.g. `src/acp/rate-limit.ts`, exporting `isRateLimitError(message: string): boolean`): a case-insensitive check of the message against the agreed marker set (`429`, `rate limit`, `too many requests`, and any other markers confirmed useful during implementation).
4. **`src/acp/manager.ts`**: in `run()`'s `error:` callback (`:121`), call the new helper on `m`; when it matches, additionally call `notify(this.managers, 'rate-limited', label)` before/after the existing `notify(this.managers, 'state-change', label)` call — the existing call and the appended error line are unchanged.
5. **`src/monitor/manager.ts`**: in `flush()`'s `onError` (`:171-174`), call the new helper on `message`; on a match, additionally call `notify(this.managers, 'rate-limited', reg.owner)` — the existing append and `this.respawn(reg)` call are unchanged.
6. **`src/monitor/ask.ts`**: in `askMonitor`'s `onError` (`:32-35`), call the new helper on `message`; on a match, additionally call `notify(managers, 'rate-limited', owner)` — the existing `finishRunning`/`onRespawn()` calls are unchanged.
7. **Config defaults**: `DEFAULT_CONFIG.notifications.events` in `src/config.ts:16-22` gains `rateLimited: false`, matching the existing opt-in-by-default convention of the other four toggles (all `false`).
8. **Spec update**: `product/specs/notifications.md`'s ambient-events list (around `:51-61`) gains the new event, its config toggle, and documents the wording and detection scope (the three real query paths named in decision 1, phrase-matched, additive to the existing in-tab error where one exists).

## Tests

- `src/acp/rate-limit.test.ts` (new): `isRateLimitError` returns true for messages containing `429`, `rate limit`, `too many requests` (and case-insensitive variants), and false for an unrelated ACP error message.
- `src/notifications.test.ts`: `notificationText('rate-limited', label)` returns the expected wording; `shouldNotify` respects the new config toggle and the existing focus-suppression rule for the new event, the same way it's tested for the existing four ambient events.
- `src/acp/manager.test.ts`: a query failing with a rate-limit-shaped message triggers both the existing error append/`state-change` notify and a new `rate-limited` notify call; a query failing with an unrelated error message triggers only the existing behavior (no `rate-limited` notify).
- `src/monitor/manager.test.ts`: a `flush()` query failing with a rate-limit-shaped message triggers the existing append + `respawn` behavior plus a new `rate-limited` notify call; an unrelated error message triggers only the existing behavior.
- `src/monitor/ask.test.ts`: an `askMonitor` query failing with a rate-limit-shaped message triggers the existing `finishRunning`/`onRespawn` behavior plus a new `rate-limited` notify call; an unrelated error message triggers only the existing behavior.

## Out of scope

- Any change to the existing in-tab error line's content or format for any of the three sites.
- Retrying, backing off, or otherwise altering how a rate-limited query is handled beyond notifying — the query still fails (and, for the two monitor sites, still respawns) exactly as it does today.
- A structured rate-limit error code from the ACP SDK or agent adapters (none exists to consume).
- Debouncing or coalescing repeated rate-limit notifications from the same tab — each failure notifies independently, same as every other ambient event today.
- `src/monitor/session.ts`'s two `onError` sites (per decision 6) — including fixing the persona-priming prompt's currently-silent failure path, which is a pre-existing gap unrelated to this feature.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: with the notifications tab open, the new `rateLimited` config toggle turned on, and the failing tab not focused, trigger an `acp <prompt>` query against a stubbed/forced failure whose message contains `429` (or run against a real provider until it rate-limits) and confirm both the existing in-tab error line and a new `Agent '<label>' is being rate limited` notifications-tab line appear. Repeat for a monitor persona's periodic flush query and for `monitor ask <persona> <question>`, and separately confirm a non-rate-limit ACP error at each of the three sites produces only the existing behavior with no new notification.
