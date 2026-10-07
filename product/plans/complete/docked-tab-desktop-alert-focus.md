# Docked-tab desktop alert focus

**Complexity: 4/10** — client-only change across the notifications feature, the sidebar selection hook, and one app-shell wiring line, with a small new app-level coordinator and no server or wire change.

PR #1575 added desktop alerts and bell sounds that are suppressed only while the originating tab is the active centre tab in a focused window, and whose click always sends `focusTab`. A docked tab (a file navigator, notifications feed, or plugin in a sidebar) is never the centre active tab, and the server's `setActiveTabOp` refuses to activate a docked tab. So an alert from a docked tab interrupts someone already looking at it, and clicking its banner does nothing useful after they switch sidebar entries.

## Design decisions

1. **A docked tab counts as visible when it is its sidebar's selected entry.** Suppression for a docked tab is "window focused and the tab is the selected entry in its sidebar"; for a centre tab it stays "window focused and the tab is the active centre tab". Focus here means window focus, matching the existing centre rule.
2. **Placement is read at the moment it matters.** Whether the originating tab is docked is read from the latest server state when the alert arrives and again when the banner is clicked, so a tab docked or undocked between delivery and click goes to its current home.
3. **A docked click selects the sidebar entry locally.** Clicking a docked tab's banner focuses the window and selects that tab's sidebar entry without sending `focusTab`, so it is never undocked. A centre tab's banner keeps sending `focusTab` exactly as before. If the docked tab's sidebar no longer shows it, the click falls back to `focusTab`, which the server ignores for docked or missing tabs as today.
4. **Coordination lives in the app layer.** Sidebar selection is local React state in `web/src/useSidebarSelection.ts`, which is app-shell code; `web/src/notifications/` is a feature and may not import it. A new app-level module `web/src/sidebar-selection-coordinator.ts` keeps, per client, each sidebar's selected label and a selector callback. `useSidebarSelection` publishes and registers into it; `App.tsx` hands it to `useNativeNotifications` through a small interface the notifications feature declares. No cross-feature import is introduced.

## Implementation steps

1. Add `web/src/sidebar-selection-coordinator.ts`: a `SidebarSelectionCoordinator` class with `publish(side, label)`, `register(side, select)`, `isSelected(label)`, and `select(label)`, plus `sidebarSelectionFor(client)` returning one coordinator per client through a `WeakMap`.
2. In `web/src/useSidebarSelection.ts`, publish the current entry's label for its side and register a selector that selects a label only when it is one of this side's entries; clear both on unmount.
3. In `web/src/notifications/native-notifications.ts`, replace the `focusedTab` string with an `AlertPlacement` (`isVisible(label)`, `reveal(label)`): suppress when the window has focus and `isVisible` is true; on click focus the window and send `focusTab` only when `reveal` returns false.
4. Add `web/src/notifications/alert-placement.ts` with `createAlertPlacement(getState, docked)` building that placement from the latest state and a `DockedAlertSelection` (`isSelected`, `select`).
5. In `web/src/notifications/useNativeNotifications.ts`, accept an optional `DockedAlertSelection`, keep the latest state, and pass the placement to `show`.
6. In `web/src/App.tsx`, pass `sidebarSelectionFor(client)` to `useNativeNotifications`.
7. Update `product/specs/notifications.md` § Desktop alerts and bell sounds.

## Tests

- `web/src/notifications/native-notifications.test.ts`: existing centre cases adapted to the placement interface; a centre click still sends `focusTab`; a docked click that the placement reveals focuses the window, closes the banner, and sends no `focusTab`.
- `web/src/notifications/alert-placement.test.ts`: a docked tab is visible only while it is the selected sidebar entry (and the centre active label does not count for it); a centre tab is visible only while active; reveal selects a docked tab, declines a centre tab, and reads placement at click time.
- `web/src/sidebar-selection-coordinator.test.ts`: publish/isSelected per side, select routes to the side that owns the label, unregister clears both.
- `web/src/Sidebar.alert-selection.test.tsx` (a new file beside `Sidebar.test.tsx`, which is already near the size limit): a rendered sidebar publishes its selected entry, and `select` through the coordinator switches the visible entry without sending any RPC (no undock).

## Out of scope

- Releasing banners on client disposal and monotonic bell throttling (separate backlog entries).
- Moving DOM focus into the docked panel's content; the click selects the entry and focuses the window.
- Any server change to `focusTab` or docked-tab activation.
