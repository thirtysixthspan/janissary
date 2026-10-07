# Release native notifications on client disposal

**Complexity: 3/10** — one client class gains lifetime tracking for the desktop banners it creates, with colocated tests and one spec sentence; no server, wire, or page-lifecycle change.

PR #1575 added desktop alerts. `NativeNotifications.dispose` pauses sounds but leaves the browser notifications and their click listeners alive, each holding a reference to a client the page lifecycle can dispose and replace (`pagehide` disposes the client, a persisted `pageshow` reconnects it or the app builds a new one). Clicking a retained banner afterwards sends `focusTab` through a closed WebSocket and focuses nothing.

## Design decisions

1. **The service owns the banners it creates.** Each banner is held in a map with its own release function until it is clicked, closed by the OS or the user, or the service is disposed, so references never grow beyond the banners currently on screen.
2. **Release is idempotent and removes both listeners.** The release function removes the `click` and `close` listeners and forgets the banner. A click releases before acting; the OS `close` event releases a banner dismissed independently.
3. **Dispose closes only service-owned banners.** It marks the service disposed, releases and closes every banner it still holds, and keeps the existing audio cleanup. Banners of a replacement client are untouched. A banner the OS already dismissed is gone from the map through its `close` event, and `close()` on one that slipped through is guarded so it cannot throw.
4. **Late clicks are inert.** The retained click handler returns immediately on a disposed service: no window focus, no placement reveal, no RPC. A disposed service also shows nothing further.
5. **Page lifecycle untouched.** `web/src/client-page-lifecycle.ts` already disposes the client on `pagehide`; the hook's effect cleanup already calls `NativeNotifications.dispose`. Neither needs to change.

## Implementation steps

1. In `web/src/notifications/native-notifications.ts`, add a `disposed` flag and a `banners` map from `Notification` to its release function.
2. Rewrite `showDesktop` to register `click` and `close` listeners that share one idempotent `release`, make the click handler a no-op once disposed, and track the banner.
3. Extend `dispose` to set `disposed`, release and close every tracked banner, then pause and clear sounds as before; make `show` return early once disposed.
4. Update `product/specs/notifications.md` § Desktop alerts and bell sounds with the disposal behavior.

## Tests

In `web/src/notifications/native-notifications.test.ts`, with the `Notification` mock extended to record listeners per event type and to support `removeEventListener`:

- a banner clicked normally still focuses the window and sends `focusTab` (existing tests keep passing);
- creating a banner, disposing the service, then firing the retained click handler sends no RPC, does not focus the window, and does not reveal;
- dispose closes every banner the service still owns and removes their listeners, while a banner a different service created stays open;
- a banner closed independently by the OS is released, so dispose does not close it again, and repeated shows followed by OS closes leave no tracked banners;
- show after dispose creates no banner and no sound.

## Out of scope

- Monotonic bell throttling (separate backlog entry).
- Any change to `web/src/client-page-lifecycle.ts` or the notification hook.
- Changing how permission, sounds, or docked coordination work.
