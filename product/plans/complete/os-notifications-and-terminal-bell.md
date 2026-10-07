# OS notifications and terminal bell

**Complexity: 5/10** — spans server and web with a new wire event, touching about twelve files, with a new client module that owns notification construction, audio playback with per-category volume/mute config, and click-to-focus, with the toast system as a close precedent.

A web app has no way to reach the user once its window is behind another application. `notifications.md` § Delivery model says it plainly: "There is still no sound and no OS-level notification." The only surfaces are an in-window toast and the notifications feed, both invisible the moment the window is backgrounded — exactly when a fleet of background agents is finishing. This feature raises a native (OS-level) notification and plays a terminal bell sound for the events Janissary already detects, suppressed when the owning tab is the app's focused tab, so the user can switch to other work while a long task runs and still know when it needs them.

## Design decisions

### Product

1. **The trigger is the existing `notify()` path, filtered to needs-user events.** Every event Janissary already detects flows through `notify()` in `src/notifications/index.ts`. The native notification and bell are raised only for needs-user events — the explicit events where a tab needs the user's attention: `question`, `harness-idle`, `auto-approve`, `auto-resume`, `editor-suggest`, `transcript-unavailable`, `ssh-recording-failed`, `harness-recording-failed`, `shell-recording-failed`, `e2e-browser-gone`, `file-operation`, `open-unsupported`, `plugin-note`, `plugin-failure`, `schedule-late`, `remote-session-terminated`, `remote-session`, `launch-refused`, `launch-workspace-cleaned`, `launch-root-cloned`, `remote-refused`, and `manual`. Ambient events (`state-change`, `incoming-message`, `schedule-fire`, `agent-start`, `rate-limited`) are excluded — they are background activity, not a tab needing the user. No new detection, no new event types.
2. **Suppression: the owning tab is the app's focused tab.** When the tab that produced the event is the active tab in the Janissary window, no native notification and no bell fires. This applies unconditionally to all needs-user events, even those that currently bypass focus suppression for the feed (e.g., `question`). The feature text: "suppressed when the owning tab is the app's focused tab."
3. **The app is a web app.** There is no Electron shell. "OS-level notification" means the Web Notifications API (`new Notification()`), which the browser delivers to the OS notification center. "Terminal bell" means an audible sound played through the browser's audio — no title flash, no browser-tab attention signal beyond the sound.
4. **Permission is never requested.** The app never calls `Notification.requestPermission()`. It attempts `new Notification()` only if the browser already reports `granted`. If `denied` or `default`, it silently omits the banner; code cannot hardcode browser permission. The config toggle is the only in-app gate. A fresh browser profile needs the user to grant permission in browser settings.
5. **Click focuses the window and the owning tab.** Clicking the native notification brings the Janissary window to front and focuses the owning tab via the existing `focusTab` RPC (`src/protocol/core-rpc.ts`). The user lands exactly where the notification came from.
6. **Two config toggles, both on by default.** `osNotifications` and `terminalBell` in `.janissary/config.json`, both default `true`. The user opts out of each independently. This follows the existing pattern for notification config in `src/config.ts`.
7. **The bell has three sound categories.** Each needs-user event maps to one of three categories, each with its own audio file:
   - **Success** — `manual`, `plugin-note`. A pleasant completion sound.
   - **Warning** — `question`, `harness-idle`, `auto-approve`, `auto-resume`, `schedule-late`, `remote-session-terminated`, `remote-session`, `launch-refused`, `launch-workspace-cleaned`, `launch-root-cloned`, `remote-refused`. An attention sound.
   - **Error** — `plugin-failure`, `e2e-browser-gone`, `file-operation`, `open-unsupported`, `transcript-unavailable`, `ssh-recording-failed`, `harness-recording-failed`, `shell-recording-failed`, `editor-suggest`. An error sound.
8. **The app ships with default audio files; the user can replace them.** Three small MP3 files in `web/public/sounds/`: `success.mp3`, `warning.mp3`, `error.mp3`. The user replaces a file to customize that category's sound. No path config — the file is replaced in place.
9. **Volume and mute are configurable per category.** In `.janissary/config.json`: `terminalBellVolumeSuccess`, `terminalBellVolumeWarning`, `terminalBellVolumeError` (each 0–1, default 0.8) and `terminalBellMuteSuccess`, `terminalBellMuteWarning`, `terminalBellMuteError` (each boolean, default false). The user can mute individual categories or adjust their volume independently.

### Implementation

10. **The server classifies; the client handles window focus.** The server owns eligible events, sound category, channel toggles and volume. It broadcasts a one-shot wire event carrying tab identity, display name, message, category, desktop-enabled flag and effective volume. Each client alone knows whether its window is focused and suppresses when that is true and the selected tab owns the event. This preserves authoritative notification rules without discarding background-window alerts.
11. **The client owns the browser notification and audio lifecycle.** Notification construction, click-to-focus, and HTML audio playback live under `web/src/notifications/`. The server never knows whether the browser granted permission or whether the notification was shown.
12. **The native event is independent of the feed/toast decision.** The toast is suppressed when the feed is visible; the native notification is not. It fires whenever the owning tab is not focused, regardless of feed visibility. This is a separate surface with its own suppression rule.
13. **The emit lives in `deliverNotification()`.** After recording a live event but before deciding whether to toast or show the feed, it checks the explicit-event classification and config, then emits the native event independently of the feed's visibility. Replayed events stop before this emit.
14. **The notification title is `Janissary`; the body is `<from>: <message>`.** The title is always the app name. The body matches the toast format: the tab's display name then the message, consistent with the feed line format.
15. **The bus event type is `native-notification`.** Added to the `NotificationsEvent` union in `src/bus.ts` alongside `toast`, `clear`, and `reveal`. The `Sinks` type in `src/controller/types.ts` gains a `sendNativeNotification` field. `wireControllerEvents` in `src/controller/events.ts` subscribes to it and calls the sink. The sink in `src/index.ts` broadcasts the wire event. The `ServerEvent` union in `src/protocol/events.ts` gains the `NativeNotificationEvent` variant.
16. **The sound category is computed on the server.** A mapping from explicit `NotificationEventType` values to `'success' | 'warning' | 'error'` lives in `src/notifications/`. Ambient values map to nothing. The server includes the category and effective volume in the event so the client does not re-derive them.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Single entry point for all notification events | `notify()` | `src/notifications/index.ts` |
| Focus suppression + ambient toggles | `shouldNotify()` | `src/notifications/index.ts` |
| Feed vs toast delivery decision | `deliverNotification()` | `src/notifications/deliver.ts` |
| Wire event for client-raised surfaces | `ToastEvent`, `ToastClearEvent` | `src/protocol/events.ts` |
| Bus channel for notification surfaces | `NotificationsEvent` union | `src/bus.ts` |
| Controller subscription to bus events | `wireControllerEvents` | `src/controller/events.ts` |
| Sink type for client broadcasts | `Sinks` | `src/controller/types.ts` |
| Client listener registry for notification surfaces | `NotificationEventListeners` | `web/src/toasts/notification-event-listeners.ts` |
| Config toggles for notification features | `NotificationConfig`, `notifications` in `Config` | `src/config.ts` |
| Tab focus RPC | `focusTab` | `src/protocol/core-rpc.ts` |
| Tab focus state on the client | `useWindowFocus`, active tab tracking | `web/src/` |
| Tab title management | `useProjectTitle` | `web/src/useProjectTitle.ts` |

## Proposed changes

### Server (`src/notifications/deliver.ts`, `src/notifications/sound-category.ts`)

A helper in `deliverNotification()` emits for live explicit events when desktop banners are enabled or the category's unmuted bell volume is positive. It sends the owning label, display name, message, sound category, desktop-enabled flag and effective volume on the `notifications` bus channel. A small module `src/notifications/sound-category.ts` classifies all explicit events and excludes ambient events. The server does not suppress a selected tab: its window may be behind another app.

### Wire (`src/protocol/events.ts`, `src/bus.ts`, `src/controller/`)

- `NativeNotificationEvent` in `src/protocol/events.ts`, exported from `src/protocol.ts`, carries `{ t: 'native-notification'; tab: string; from: string; message: string; category: 'success' | 'warning' | 'error'; desktop: boolean; volume: number }`.
- `src/bus.ts` and `src/controller/types.ts` derive their event shapes from that shared contract.
- `wireControllerEvents` in `src/controller/events.ts` subscribes to `native-notification` and calls the sink in `src/index.ts` to broadcast the event.

### Client (`web/src/notifications/`)

A new feature module with two files:
- A service class (`native-notifications.ts`) that compares `document.hasFocus()` and the selected label, handles best-effort browser notification construction, click-to-focus, and plays the MP3 for the server-selected category at the effective volume. It plays at most one bell per second and releases audio elements on disposal.
- A thin hook (`useNativeNotifications.ts`) that subscribes to the state snapshot and new one-shot event through `JanusClient`, keeping the selected label current. `web/src/App.tsx` mounts it. Click handling focuses the window and sends the `focusTab` RPC with the owning tab's label.

### Audio files (`web/public/sounds/`)

Three small MP3 files: `success.mp3`, `warning.mp3`, `error.mp3`. Each is a fraction of a second. The user replaces a file to customize that category's sound.

### Config (`src/config.ts`)

`src/config.ts` defines `osNotifications` and `terminalBell` (both default `true`), three category volumes (default `0.8`) and three mutes (default `false`). `src/config-decode.ts` accepts only finite volumes from 0 to 1. The server sends each event's effective settings; the client does not mirror project config.

### Autonomous implementation decisions after code inspection

- `document.hasFocus()` is the browser's actual window focus signal. The server knows only the selected tab, so it cannot suppress on the selected tab alone: that would discard every alert when the app window is behind another app. Broadcast eligible events and let each client suppress only when its window is focused **and** its current active tab has the originating label. This is view-local focus, not server-owned notification classification. The latest state snapshot supplies the selected label; missing initial state does not suppress. A secondary visible tab does not count as the focused tab.
- Keep the existing server classification and toggles, but send the effective OS-enabled flag and per-category effective bell volume (zero for muted/off) with each one-shot event. The server owns the settings; no mirrored client config or state-field sync is needed. `config-decode.ts` validates finite 0–1 volume values; malformed numbers fall back to defaults. Replayed historical notifications do not raise a current-time OS banner or sound, as replayed toasts already do not.
- Since the Web Notifications API cannot override browser or OS permission, "hardcode acceptance" means never request permission, not spoofing a grant. A fresh browser profile may require the user to grant notifications in browser settings; otherwise only the bell can work. Audio playback can likewise be blocked by browser autoplay policy before an interaction. Both failures are best-effort and leave the feed intact.
- Update `product/specs/application-config.md` and the `notifications` command entry in `help.md` for discoverability, alongside `product/specs/notifications.md`. `web/public/` does not exist yet; create it for Vite's public assets, and add the MP3 MIME type to `src/serve-static.ts` so production serves them correctly. The checked-in files are defaults; replacing them requires rebuilding the installed web bundle. Client requests use the existing session URL helper rather than exposing file paths.
- The client subscription belongs in `web/src/App.tsx` (app layer), and `web/src/ws.ts` exposes the one-shot listener. Add the event type to the shared `src/protocol.ts` re-exports. Add `web/src/notifications/` as a feature boundary in ESLint only if feature imports demand it; it must not import sibling features. Those are additional required edits established by inspection, not scope expansion.

## Tests

- Extend `web/src/ws.test.ts` to pin one-shot listener delivery and unsubscribe. Extend `src/config.test.ts` to pin defaults, opt-outs, category volume/mute and invalid volume fallback. Update the existing `web/src/App.test.tsx` client stub to implement the new one-shot subscription so unrelated app tests still mount; check it is cleaned up on unmount.

- **Server** (`src/notifications/native.test.ts`): eligible events send a banner request and effective volume even when the feed is visible or the server-selected tab owns the event; replayed and ambient events do not. Config toggles/mute and all explicit sound categories are covered.
- **Client** (`web/src/notifications/native-notifications.test.ts`): the service suppresses only when both the window and owning tab are focused, constructs the expected banner, focuses on click, plays the category MP3 at the delivered volume, throttles only the bell, and handles permission/autoplay failure.

## Out of scope

- No new notification events or detection logic — only the existing `notify()` path.
- No Electron or desktop shell — the app stays a web app.
- No OS-level notification history or management.
- No configurable sound file paths — the user replaces files in place.
- No per-event toggles for native notifications — one toggle for all needs-user events.
- No title flash or browser-tab attention signal.
- No `Notification.requestPermission()` call.
- No change to the existing toast or feed behavior.

## Verification

- `./scripts/run.mjs check-diff` after implementation.
- Manual: open two tabs, background the Janissary window, trigger a needs-user event on a non-focused tab (e.g., `notify hello` from another tab), confirm the OS notification appears and the correct category sound plays. Switch to the owning tab and confirm no native notification fires. Toggle the config off and confirm silence. Replace a sound file and confirm the new sound plays.
