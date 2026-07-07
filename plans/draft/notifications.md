# Notifications for Background Tab Events

**Complexity: 5/10** — new config surface, a new server push channel (no generic one exists yet), and a new toast/sound UI, but every event source already funnels through one of two existing hook points (`TabManager.append`'s `entry:appended` broadcast, or `ScheduleManager.fire`), so there's no new state-machine to invent.

## Summary

Add opt-in notifications (sound and/or transient toast banner) that fire when a background tab transitions into a state worth noticing — a harness finishes running, an agent becomes blocked, a scheduled command fires, an incoming `msg`/`broadcast` arrives. The currently focused tab is suppressed from notifying about its own activity. Configurable per event type in `.janissary/config.json`, with a global mute toggle.

## Decisions (to be confirmed with user)

1. **Notification model: toast banner + optional sound.** Two channels: a transient toast banner rendered in the web UI (dismissible, auto-fades after 5 seconds), and an optional short sound effect played via the Web Audio API. Both are independently togglable in config.
2. **Config-driven, not per-tab UI.** Notification preferences live in `.janissary/config.json` under a `notifications` key. There is no per-tab UI — users configure globally. The feature is opt-in: all notifications default to OFF.
3. **Event types that can notify:** `state-change` (an agent tab's busy flag clears — `TabManager`'s `busy` set, via `finishRunning`/`deleteBusy`, going true → false; there is no separate "blocked" tab state in the codebase to distinguish from "done", so this event means exactly "busy → idle", nothing more), `incoming-message` (msg/broadcast received by a non-focused tab — detected via a `LogEntry` with `from` set, see Verified codebase facts), `schedule-fire` (a scheduled command fires in a non-focused tab), `agent-start` (an ACP session's first `startTurn`, i.e. `TabManager.addBusy` transitioning false → true for an ACP tab). Each is independently togglable.
4. **Focus suppression.** The currently active tab never generates notifications. Only background tabs fire.
5. **Global mute.** A `notifications off` command toggles a global mute flag in config, suppressing all notifications without changing per-event toggles. `notifications on` restores.

## What already exists (reuse, don't rebuild)

| Need | Existing mechanism | Location |
| --- | --- | --- |
| Runtime-mutable, disk-persisted config | `updateConfig(partial)` — the exact pattern `syntax theme <name>` already uses (`updateConfig({ syntaxTheme: canonical })`), called directly from a command handler, no dedicated RPC | `src/config.ts`, `src/commands/syntax.ts:34` |
| "Something happened in a background tab" — the single generic signal every transcript append already produces | `TabManager.append()` calls `markUnread(label)` (which itself already no-ops for the active tab) and emits `messageBus` `'transcript'` `'entry:appended'` with the full `LogEntry` and `tab`; `Controller` and `MonitorManager` already subscribe to this exact event as a decoupled observer, rather than having every source manager call them directly | `src/tab-manager.ts:105-109,208-219`, `src/controller.ts:53-56`, `src/monitor-manager.ts:101-107` |
| Distinguishing an incoming cross-agent message from any other transcript entry | `LogEntry.from` is set only for `msg`/`broadcast` deliveries (`AgentCommunicationManager.handle`'s `info`/`response`/`request` branches all set `from`); both `msg` and `broadcast` funnel through the same `communication.send` → `handle` → `append` path, so one check covers both commands | `src/types.ts:16`, `src/agent-communication-manager.ts:53-77`, `src/commands/msg.ts`, `src/commands/broadcast.ts` |
| Busy/idle transition for state-change and agent-start | `TabManager.isBusy/addBusy/deleteBusy` (`busy` Set); ACP specifically calls `addBusy` on `startTurn` (agent-start) and `deleteBusy` on `finished`/`error` (state-change) | `src/tab-manager.ts:22,42,54,58`, `src/acp-manager.ts:109,114,119` |
| Schedule dispatch point | `ScheduleManager.fire()` is called once per due entry from `tick()`/`fireDue()`; this is the only place a scheduled command is delivered, for both harness (PTY write) and agent (`command.dispatchTo`) targets | `src/schedule-manager.ts:71-98` |
| A server → client push outside the request/response cycle | `Sinks` (`src/types.ts:460-465`) is the only such channel today, and it's narrow: `emitState`, `sendPty`, `sendPtyExit`, `exit`. Implemented in `src/index.ts:59` (`sendPty: (id, data) => broadcast({ t: 'pty', id, data })`). There is **no existing generic "push an arbitrary event to the client" sink** — adding `showNotification` means adding a new `Sinks` field and a matching `broadcast({ t: 'notification', ... })` call in `src/index.ts`, mirroring `sendPty` exactly. |
| Transient/floating overlay UI conventions (CSS positioning, not auto-dismiss/stacking behavior) | `RouteChooser.tsx`/`HistoryPicker.tsx` use a `.picker`-family fixed-position overlay, but both are modal/keyboard-navigated with no auto-dismiss timer or stacking — useful for positioning conventions only. Toast's auto-fade and multi-toast stacking have no precedent in the codebase and are net-new UI logic. | `web/src/RouteChooser.tsx`, `web/src/HistoryPicker.tsx` |

## Verified codebase facts that shape the design

- **There is no `MessageHandler` or `AgentManager` class.** Message delivery (`msg`/`broadcast`) is `AgentCommunicationManager` (`managers.communication`); ACP session management is `AcpManager` (`managers.acp`). Both are listed in `Managers` (`src/managers.ts`).
- **`config-manager.test.ts` does not exist** — the real config test file is `src/config.test.ts`.
- **A dedicated `setNotificationConfig` RPC would duplicate the config-mutation pattern rather than reuse it.** `syntax theme <name>` doesn't use a separate "set config" RPC — the command handler calls `updateConfig` directly, server-side, in response to typed input. `notifications on`/`notifications off` should do the same: no new RPC needed for config changes, only for the toast push (see table above).

## Proposed changes

### 1. Config type

- Add `notifications?: NotificationConfig` to `Config` (`src/types.ts`):
  ```typescript
  type NotificationConfig = {
    muted: boolean;
    sound: boolean;
    events: {
      stateChange: boolean;
      incomingMessage: boolean;
      scheduleFire: boolean;
      agentStart: boolean;
    };
  };
  ```
  All `events.*` fields default to `false` (opt-in). `muted` defaults to `false`. `sound` defaults to `false`.

### 2. Server-side notification triggers

- New module `src/notifications.ts`:
  - `shouldNotify(config: NotificationConfig, event: NotificationEventType, tabLabel: string, activeLabel: string): boolean` — checks config toggles, mute flag, and focus suppression (`tabLabel === activeLabel` → `false`, mirroring the check already inlined in `TabManager.markUnread`).
  - `NotificationEventType` union: `'state-change' | 'incoming-message' | 'schedule-fire' | 'agent-start'`.
  - Exports `notify(managers, config, event, tabLabel)` — when `shouldNotify` passes, builds the toast text (per event type) and calls the new `Sinks.showNotification` (see Protocol below).
- Hook points, using the real managers/hooks (not `MessageHandler`/`AgentManager`, which don't exist — see Verified codebase facts):
  - `incoming-message`: one subscription, in `Controller`'s constructor alongside its existing `messageBus.on('transcript', 'entry:appended', ...)` handler (`src/controller.ts:53-56`) — when `event.entry.from` is set, call `notify(..., 'incoming-message', event.tabLabel)`. Covers both `msg` and `broadcast`, since both funnel through `AgentCommunicationManager.handle` → `append`.
  - `state-change` and `agent-start`: `AcpManager.run()`'s `startTurn`/`finished`/`error` hooks (`src/acp-manager.ts:109,114,119`) — `startTurn` (when `isFirst`) fires `agent-start`; `finished`/`error` fire `state-change`. These already sit next to the `addBusy`/`deleteBusy` calls, so no new busy-tracking is needed.
  - `schedule-fire`: `ScheduleManager.fire()` (`src/schedule-manager.ts:85-98`) — after a successful fire (`return true` branches), call `notify(..., 'schedule-fire', tab.label)`.
- Each hook point has access to `Config` via `getConfig()` (`src/config.ts`) and to `Managers` (already threaded through every manager's constructor).

### 3. Web UI — Toast component

- New module `web/src/Toast.tsx`:
  - State: array of `{ id: string; text: string; type: NotificationEventType; tabLabel: string }` — active toasts.
  - `showToast(text, type, tabLabel)` appends a toast; auto-removes after 5 seconds (setTimeout).
  - Each toast: small banner anchored to the top-right corner, dismissible (× button), shows an icon + "Agent 'deploy-agent' finished" text, clickable (clicking the toast activates the notifying tab via `setActiveTab`).
  - Styling: new `.toast-container`/`.toast` CSS rules; `RouteChooser`/`HistoryPicker`'s `.picker` fixed-position convention is a useful reference for anchoring, but auto-fade and vertical stacking have no precedent and must be built from scratch (see Verified codebase facts).
- App integration: render `<Toast />` as a sibling of the main layout in `App.tsx`, always mounted, passive. It subscribes to the new `notification` WebSocket message (see Protocol) the same way `App.tsx` already handles the `pty` message type for `sendPty`/`sendPtyExit`.
- No client-side interception is needed for `notifications on`/`off`: like `syntax theme <name>` (`src/commands/syntax.ts`), it is a plain command dispatched to the server, which calls `updateConfig` directly and appends a confirmation line. `CommandInput.tsx`/`App.tsx`'s `onSubmit` special-casing (used for opening the `syntax theme` picker UI) is not needed here since there's no interactive picker for a two-state toggle.

### 4. Protocol

- New `Sinks` field `showNotification: (event: { type: NotificationEventType; text: string; tabLabel: string }) => void` (`src/types.ts:460-465`), implemented in `src/index.ts` next to `sendPty` (`src/index.ts:59`) as `showNotification: (event) => broadcast({ t: 'notification', ...event })`. This is net-new plumbing — no generic server-push-to-client channel exists today (see Verified codebase facts); the closest precedent is the narrow, purpose-built `sendPty`.
- Client: extend the WebSocket message handler's `switch` (`web/src/ws.ts:33`, `case 'pty':`) with a `case 'notification':` that calls `Toast`'s `showToast`.
- No new RPC for config changes — `notifications on`/`notifications off` (new `src/commands/notifications.ts`, matching `src/commands/syntax.ts`'s shape) calls `updateConfig({ notifications: { ...getConfig().notifications, muted: true/false } })` directly, exactly like `syntax theme <name>` calls `updateConfig({ syntaxTheme: canonical })`. Reject the earlier `setNotificationConfig` RPC idea — it would duplicate an existing pattern instead of reusing it.
- Future expansion: `notifications sound on|off`, `notifications <event> on|off` for per-event toggling (v2).

### 5. Sound playback

- New directory `web/src/sounds/` with short notification sounds (e.g., `ding.mp3`, `chime.mp3`). License: CC0/public domain only.
- `web/src/sounds.ts` module: `playSound(type: NotificationEventType)` — loads and plays the appropriate sound via `new Audio('/sounds/ding.mp3').play()`. Checks `config.notifications.sound` before playing.
- Sound files are small (<100KB) and loaded on-demand (lazy), not bundled into the main JS payload.

### 6. Specs

- New `specs/notifications.md`: event types, config model, toast UX, focus suppression, sound playback, `notifications` command syntax.
- `specs/application-config.md`: add `notifications` to the config table.
- `specs/application-commands.md`: add `notifications` command.

### 7. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/notifications.test.ts`: `shouldNotify` — fires for background tab, suppressed for active tab, suppressed when muted, suppressed when event type disabled, all four event types.
- `src/config.test.ts` (existing file — not `config-manager.test.ts`, which doesn't exist): add cases for default `notifications` config and round-trip serialization.
- `web/src/Toast.test.tsx`: renders toasts, auto-dismiss, click-to-activate, stack behavior.
- `web/src/sounds.test.ts`: `playSound` plays the correct file for each event type.
- Hook-point integration tests: `Controller`'s `entry:appended` subscriber fires `incoming-message` when `entry.from` is set and the target tab isn't active (`src/controller.test.ts` — existing file, has extensive coverage of this subscription already); `AcpManager.run` fires `agent-start`/`state-change` at the right points (`src/acp-manager.test.ts`); `ScheduleManager.fire` fires `schedule-fire` (`src/schedule-manager.test.ts`).

## Out of scope

- Per-event or per-sound customization beyond the four fixed event types and the single mute toggle (`notifications <event> on|off`, `notifications sound on|off` are explicitly deferred to v2, per Protocol above).
- Desktop/OS-level notifications (only the in-app toast + Web Audio sound).
- Notification history or a way to review missed notifications after the toast fades.
- Changing `TabManager.markUnread`'s existing behavior — notifications are an additive signal layered on top of it, not a replacement.

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end check: enable `notifications.events.incomingMessage` and `notifications.sound` in `.janissary/config.json`, open two tabs, `msg` from one to the other while the second is not focused, and confirm a toast appears (with sound, if audio is available in the test environment) and clicking it activates the target tab. Then run `notifications off` and confirm the same `msg` produces no toast.

## Implementation order

1. Config type: `NotificationConfig` + defaults, tests. No dependency on later steps.
2. Server notification module: `src/notifications.ts` with `shouldNotify`/`notify()`, tests. Depends on step 1 for the config shape; the `Sinks.showNotification` call inside `notify()` can be stubbed until step 3 lands.
3. Protocol: new `Sinks.showNotification` field, `src/index.ts` broadcast implementation, `web/src/ws.ts` `case 'notification':`, tests.
4. Hook points: wire `notify()` calls into `Controller`'s `entry:appended` subscriber, `AcpManager.run`, and `ScheduleManager.fire`, tests. Depends on steps 2–3.
5. Web UI: `Toast` component + sound playback module, tests. Depends on step 3 for the client-side message.
6. `notifications` command: `src/commands/notifications.ts` (mirrors `src/commands/syntax.ts`, calls `updateConfig` directly — no RPC needed), tests. Depends on step 1.
7. Specs: new `notifications.md` + amendments to `application-config.md`/`application-commands.md`.
8. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.
