# OS notifications and terminal bell

**Complexity: 5/10** — spans server and web with a new wire event, client notification/audio delivery, per-category settings, placement-aware focus handling, banner lifecycle tracking, and the existing toast system as a close precedent.

A web app has no way to reach the user once its window is behind another application. Before this feature, the only surfaces were an in-window toast and the notifications feed, both invisible the moment the window was backgrounded — exactly when a fleet of background agents is finishing. The feature raises a native (OS-level) notification and plays a bell sound for live needs-user events. Each window suppresses these only when it is focused and the owning tab is visible there, including a selected docked tab. A banner click returns to its tab without undocking it.

## Design decisions

### Product

1. **The trigger is the existing `notify()` path, filtered to needs-user events.** Every event Janissary already detects flows through `notify()` in `src/notifications/index.ts`. The native notification and bell are raised only for needs-user events — the explicit events where a tab needs the user's attention: `question`, `harness-idle`, `auto-approve`, `auto-resume`, `editor-suggest`, `transcript-unavailable`, `ssh-recording-failed`, `harness-recording-failed`, `shell-recording-failed`, `e2e-browser-gone`, `file-operation`, `open-unsupported`, `plugin-note`, `plugin-failure`, `schedule-late`, `remote-session-terminated`, `remote-session`, `launch-refused`, `launch-workspace-cleaned`, `launch-root-cloned`, `remote-refused`, and `manual`. Ambient events (`state-change`, `incoming-message`, `schedule-fire`, `agent-start`, `rate-limited`) are excluded — they are background activity, not a tab needing the user. No new detection, no new event types.
2. **Suppress only when the owning tab is visible in a focused window.** For a centre tab, it is visible when its window has focus and it is the active centre tab. For a docked tab, it is visible when its window has focus and that tab is selected in its sidebar. Every client makes this decision from its own focus and placement; the server cannot suppress by the selected tab because its window may be behind another application. The rule applies to every needs-user event, including explicit feed events such as `question`.
3. **The app is a web app.** There is no Electron shell. "OS-level notification" means the Web Notifications API (`new Notification()`), which the browser delivers to the OS notification center. "Terminal bell" means an audible sound played through the browser's audio — no title flash, no browser-tab attention signal beyond the sound.
4. **Permission is never requested.** The app never calls `Notification.requestPermission()`. It attempts `new Notification()` only if the browser already reports `granted`. If `denied` or `default`, it silently omits the banner; code cannot hardcode browser permission. The config toggle is the only in-app gate. A fresh browser profile needs the user to grant permission in browser settings.
5. **Click focuses the window and selects the owning tab in its current placement.** A centre tab uses the existing `focusTab` RPC (`src/protocol/core-rpc.ts`). A docked tab becomes the selected entry of its current sidebar without being undocked. The client resolves placement again at click time; if the tab was undocked since delivery it uses `focusTab`, and if the tab closed there is nothing to focus.
6. **Two config toggles, both on by default.** `osNotifications` and `terminalBell` in `.janissary/config.json`, both default `true`. The user opts out of each independently. This follows the existing pattern for notification config in `src/config.ts`.
7. **The bell has three sound categories.** Each needs-user event maps to one of three categories, each with its own audio file:
   - **Success** — `manual`, `plugin-note`. A pleasant completion sound.
   - **Warning** — `question`, `harness-idle`, `auto-approve`, `auto-resume`, `schedule-late`, `remote-session-terminated`, `remote-session`, `launch-refused`, `launch-workspace-cleaned`, `launch-root-cloned`, `remote-refused`. An attention sound.
   - **Error** — `plugin-failure`, `e2e-browser-gone`, `file-operation`, `open-unsupported`, `transcript-unavailable`, `ssh-recording-failed`, `harness-recording-failed`, `shell-recording-failed`, `editor-suggest`. An error sound.
8. **The app ships with default audio files; the user can replace them.** Three small MP3 files in `web/public/sounds/`: `success.mp3`, `warning.mp3`, `error.mp3`. The user replaces a file to customize that category's sound. No path config — the file is replaced in place.
9. **Volume and mute are configurable per category.** In `.janissary/config.json`: `terminalBellVolumeSuccess`, `terminalBellVolumeWarning`, `terminalBellVolumeError` (each 0–1, default 0.8) and `terminalBellMuteSuccess`, `terminalBellMuteWarning`, `terminalBellMuteError` (each boolean, default false). The user can mute individual categories or adjust their volume independently.

### Implementation

10. **The server classifies; the client handles window focus and placement.** The server owns eligible events, sound category, channel toggles and volume. It broadcasts a one-shot wire event carrying tab identity, display name, message, category, desktop-enabled flag and effective volume. Each client knows its own window focus, centre state and sidebar selection, and suppresses only when the owning tab is visible in that window. The app-layer sidebar selection coordinator supplies this view-local state without a feature-to-feature import.
11. **The client owns the browser notification and audio lifecycle.** Notification construction, focus-aware suppression, centre/docked click routing, and HTML audio playback live under `web/src/notifications/`. The service owns every banner it creates, releases banners dismissed or clicked, closes remaining banners and removes listeners on disposal, and makes late clicks inert. The server never knows whether the browser granted permission or whether a notification was shown.
12. **The native event is independent of the feed/toast decision.** The toast is suppressed when the feed is visible; the native notification is not. It fires whenever the owning tab is not visible in a focused client, regardless of feed visibility. This is a separate surface with its own suppression rule.
13. **The emit lives in `deliverNotification()`.** After recording a live event but before deciding whether to toast or show the feed, it checks the explicit-event classification and config, then emits the native event independently of the feed's visibility. Replayed events stop before this emit.
14. **The notification title is `Janissary`; the body is `<from>: <message>`.** The title is always the app name. The body matches the toast format: the tab's display name then the message, consistent with the feed line format.
15. **The bus event type is `native-notification`.** Added to the `NotificationsEvent` union in `src/bus.ts` alongside `toast`, `clear`, and `reveal`. The `Sinks` type in `src/controller/types.ts` gains a `sendNativeNotification` field. `wireControllerEvents` in `src/controller/events.ts` subscribes to it and calls the sink. The sink in `src/index.ts` broadcasts the wire event. The `ServerEvent` union in `src/protocol/events.ts` gains the `NativeNotificationEvent` variant.
16. **The sound category is computed on the server.** A mapping from explicit `NotificationEventType` values to `'success' | 'warning' | 'error'` lives in `src/notifications/`. Ambient values map to nothing. The server includes the category and effective volume in the event so the client does not re-derive them.
17. **The bell is throttled by a monotonic clock to one sound per second.** Each client uses one `performance.now()` reading per attempt, unaffected by system clock adjustments. The throttle gates only the sound; each eligible desktop banner may still appear. The clock and in-memory throttle reset together on page reload.

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
| Sidebar-local selected entry | `useSidebarSelection` | `web/src/useSidebarSelection.ts` |
| Page-hide client disposal | `startClientPageLifecycle` | `web/src/client-page-lifecycle.ts` |

## Proposed changes

### Server (`src/notifications/deliver.ts`, `src/notifications/sound-category.ts`)

A helper in `deliverNotification()` emits for live explicit events when desktop banners are enabled or the category's unmuted bell volume is positive. It sends the owning label, display name, message, sound category, desktop-enabled flag and effective volume on the `notifications` bus channel. A small module `src/notifications/sound-category.ts` classifies all explicit events and excludes ambient events. The server does not suppress a selected tab: its window may be behind another app.

### Wire (`src/protocol/events.ts`, `src/bus.ts`, `src/controller/`)

- `NativeNotificationEvent` in `src/protocol/events.ts`, exported from `src/protocol.ts`, carries `{ t: 'native-notification'; tab: string; from: string; message: string; category: 'success' | 'warning' | 'error'; desktop: boolean; volume: number }`.
- `src/bus.ts` and `src/controller/types.ts` derive their event shapes from that shared contract.
- `wireControllerEvents` in `src/controller/events.ts` subscribes to `native-notification` and calls the sink in `src/index.ts` to broadcast the event.

### Client (`web/src/notifications/`)

`native-notifications.ts` creates banners and audio, suppressing only when the focused window currently shows the owning tab. `alert-placement.ts` reads centre/docked placement from the latest state and consults the per-client sidebar selection coordinator. Centre banner clicks send `focusTab`; docked banner clicks select the sidebar entry locally without undocking it. Placement is re-read at click time. The service tracks its own banners, releases their click/close listeners when they are dismissed, closes still-open owned banners and ignores late clicks when disposed, and pauses all tracked audio. It throttles sound with `performance.now()`, independently of banner delivery. `useNativeNotifications.ts` subscribes to state and one-shot events and disposes the service. `web/src/App.tsx` passes `sidebarSelectionFor(client)` from the app-layer coordinator; `web/src/useSidebarSelection.ts` publishes each side's current selection and registers its selector.

### Audio files (`web/public/sounds/`)

Three small MP3 files: `success.mp3`, `warning.mp3`, `error.mp3`. Each is a fraction of a second. The user replaces a file to customize that category's sound.

### Config (`src/config.ts`)

`src/config.ts` defines `osNotifications` and `terminalBell` (both default `true`), three category volumes (default `0.8`) and three mutes (default `false`). `src/config-decode.ts` accepts only finite volumes from 0 to 1. The server sends each event's effective settings; the client does not mirror project config.

### Autonomous implementation decisions after code inspection

- `document.hasFocus()` supplies each browser window's focus signal. Each client combines it with latest server placement and app-shell-owned sidebar selection: a centre tab is visible only at the active centre index, while a docked tab is visible only as its sidebar's selected entry. Missing state or selection does not suppress.
- The server sends the effective OS-enabled flag and per-category effective bell volume (zero for muted/off); clients do not mirror project config. Replayed reports do not raise current-time banners or sounds. Browser notification permission and autoplay are best-effort and never interrupt the feed.
- Sidebar selection is local React state. The app-layer coordinator shares it with the notifications feature without a cross-feature import. Banner placement is resolved at arrival and again at click, so an intervening dock/undock change uses the tab's current home. Docked tabs stay docked.
- Each notification service tracks only its own browser banners. Click and OS close release listeners and references; disposal closes remaining owned banners and makes late clicks inert. The existing client page lifecycle and hook cleanup already dispose the service.
- The monotonic sound throttle uses `performance.now()` rather than wall time. It resets on reload along with the in-memory notification service.
- `web/public/` carries the checked-in default cues in Vite's static bundle, and `src/serve-static.ts` serves MP3s as `audio/mpeg`. Replacing a cue requires rebuilding the installed web bundle.

## Tests

- Extend `web/src/ws.test.ts` to pin one-shot listener delivery and unsubscribe. Extend `src/config.test.ts` to pin defaults, opt-outs, category volume/mute and invalid volume fallback. Update the existing `web/src/App.test.tsx` client stub to implement the new one-shot subscription so unrelated app tests still mount; check it is cleaned up on unmount.
- `src/notifications/native.test.ts` verifies eligible events send a banner request and effective volume even when the feed is visible or the server-selected tab owns the event; replayed and ambient events do not. It covers config toggles/mute and every explicit sound category.
- `web/src/notifications/native-notifications.test.ts`, `alert-placement.test.ts`, `web/src/sidebar-selection-coordinator.test.ts`, and `web/src/Sidebar.alert-selection.test.tsx` verify focus suppression for visible centre/docked tabs, centre clicks using `focusTab`, docked clicks selecting the sidebar entry without undocking, placement changes between delivery and click, banner cleanup/disposal and inert late clicks, permission/autoplay handling, per-category audio, and monotonic throttling independent of banners.

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
- Manual: grant browser notification permission in browser settings, open a second centre tab, put the Janissary window behind another application and run `notify hello` from its selected command tab. Confirm a `Janissary` banner and success sound; click it and confirm focus returns to its source. Repeat with the same tab selected in a focused window and confirm both new surfaces are silent.
- Dock a file navigator or notifications tab, select another entry in its sidebar, and generate a needs-user event from the docked tab. Its banner should appear. Clicking it selects that entry without undocking; when it is already selected in a focused window, the alert is suppressed.
- With the feed visible, generate several explicit alerts quickly. Each eligible banner may appear while the bell plays at most once per monotonic second. Deny browser notification permission and confirm the bell remains independent; restart after changing config switches, volume, or mute settings. Replace a bundled cue and rebuild to confirm it is used.
