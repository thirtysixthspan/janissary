# Notifications for Background Tab Events

## Summary

Add opt-in notifications (sound and/or transient toast banner) that fire when a background tab transitions into a state worth noticing — a harness finishes running, an agent becomes blocked, a scheduled command fires, an incoming `msg`/`broadcast` arrives. The currently focused tab is suppressed from notifying about its own activity. Configurable per event type in `.janissary/config.json`, with a global mute toggle.

## Decisions (to be confirmed with user)

1. **Notification model: toast banner + optional sound.** Two channels: a transient toast banner rendered in the web UI (dismissible, auto-fades after 5 seconds), and an optional short sound effect played via the Web Audio API. Both are independently togglable in config.
2. **Config-driven, not per-tab UI.** Notification preferences live in `.janissary/config.json` under a `notifications` key. There is no per-tab UI — users configure globally. The feature is opt-in: all notifications default to OFF.
3. **Event types that can notify:** `state-change` (tab transitions from running → blocked or working → done), `incoming-message` (msg/broadcast received by a non-focused tab), `schedule-fire` (a scheduled command fires in a non-focused tab), `agent-start` (an agent begins processing). Each is independently togglable.
4. **Focus suppression.** The currently active tab never generates notifications. Only background tabs fire.
5. **Global mute.** A `notifications off` command toggles a global mute flag in config, suppressing all notifications without changing per-event toggles. `notifications on` restores.

## Verified codebase facts that shape the design

- **Config is runtime-mutable.** `specs/application-config.md` documents the mutate-and-write pattern. Adding a `notifications` key follows the same pattern as `syntaxTheme` and `transcriptMaxLines`.
- **Tab state tracking already exists.** `TabView` carries `busy: boolean` (dot blinks when true). The server tracks `busy` state transitions — `startRunning()` sets busy, `finishRunning()` clears it and can check `hasUnread`. Hook points already exist for detecting state transitions.
- **`hasUnread` already signals background activity.** `TabManager.markUnread(label)` is called when a background tab receives a message. This is the natural hook point for `incoming-message` notifications.
- **Schedule firing already has a dispatch point.** `ScheduleManager.tick()` iterates tabs, finds ready entries, and dispatches them. Adding a notification check at the dispatch site is straightforward.
- **Web UI already supports toast-like overlays.** `RouteChooser.tsx` and `HistoryPicker.tsx` demonstrate transient floating UI elements. A `Toast` component would follow the same pattern.
- **Sound playback is available via Web Audio API.** No external dependency needed. A `web/src/sounds/` directory can house short MP3/WAV files generated or sourced from free libraries. Playback is via `new Audio(url).play()` or a Web Audio `AudioBufferSourceNode`.

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
  - `shouldNotify(config: NotificationConfig, event: NotificationEventType, tabLabel: string, activeLabel: string): boolean` — checks config toggles, mute flag, and focus suppression.
  - `NotificationEventType` union: `'state-change' | 'incoming-message' | 'schedule-fire' | 'agent-start'`.
  - Exports a `notify()` function called from the trigger points.
- Hook points:
  - `TabManager` or `Controller`: after `finishRunning()` transitions a non-active tab from busy to idle, call `notify(config, 'state-change', label, activeLabel)`.
  - `MessageHandler` / `Controller`: after `msg`/`broadcast` delivery to a non-active tab, call `notify(config, 'incoming-message', targetLabel, activeLabel)`.
  - `ScheduleManager.tick()`: after dispatching a scheduled command in a non-active tab, call `notify(config, 'schedule-fire', tabLabel, activeLabel)`.
  - `AcpManager` / `AgentManager`: on agent first becoming busy (ACP session starts), call `notify(config, 'agent-start', label, activeLabel)`.
- Each hook point has access to the `Config` (loaded at startup, mutable at runtime via `config.ts`).

### 3. Web UI — Toast component

- New module `web/src/Toast.tsx`:
  - State: array of `{ id: string; text: string; type: NotificationEventType; tabLabel: string }` — active toasts.
  - `showToast(text, type, tabLabel)` appends a toast; auto-removes after 5 seconds (setTimeout).
  - Each toast: small banner anchored to the top-right corner, dismissible (× button), shows an icon + "Agent 'deploy-agent' finished" text, clickable (clicking the toast activates the notifying tab via `setActiveTab`).
  - Styling: `.toast-container` CSS, fixed position, right-anchored, stacks vertically if multiple, `z-index` above everything.
- App integration: render `<Toast />` as a sibling of the main layout in `App.tsx`, always mounted, passive.
- `CommandInput.tsx`: intercept `notifications on` / `notifications off` locally — sends an RPC to toggle the mute flag in config.

### 4. Protocol

- New RPC: `showNotification` (`{ method: 'showNotification'; params: { type: NotificationEventType; text: string; tabLabel: string } }`). The server calls this directly (fire-and-forget; no response needed).
- The server broadcasts `showNotification` on the WebSocket to the client. The client's `Toast` component receives it via a callback or a simple global event emitter.
- New RPC: `setNotificationConfig` (`{ method: 'setNotificationConfig'; params: Partial<NotificationConfig> }`) — client sends this to update notification settings. Server writes the updated config to disk.
- New command: `notifications on` / `notifications off` in `src/commands/notifications.ts` — toggles `config.notifications.muted`.
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
- `src/config-manager.test.ts`: default `notificationConfig`, round-trip serialization.
- `web/src/Toast.test.tsx`: renders toasts, auto-dismiss, click-to-activate, stack behavior.
- `web/src/sounds.test.ts`: `playSound` plays the correct file for each event type.
- Hook-point integration tests: `TabManager` triggers notification on `finishRunning` (mock the controller), `MessageHandler` triggers on `msg` to background tab.

## Implementation order

1. Config type: `NotificationConfig` + defaults, tests.
2. Server notification module: `src/notifications.ts` with `shouldNotify` + `notify()` + trigger points, tests.
3. Protocol: `showNotification` RPC, server broadcast, client receive, tests.
4. Web UI: `Toast` component + sound playback module, tests.
5. `notifications` command: `src/commands/notifications.ts` + `setNotificationConfig` RPC, tests.
6. Specs: new `notifications.md` + amendments to config, commands.
7. Public documentation.

Run `./scripts/run.mjs check-diff` after each step.
