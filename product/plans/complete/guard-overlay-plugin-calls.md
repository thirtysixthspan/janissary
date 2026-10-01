# Guard every host call into a contributed overlay plugin

**Complexity: 3/10** — one new module in the overlay-plugins feature (`web/src/overlay-plugins/guarded-overlay.tsx`) and a three-line change where the host registers a started overlay (`web/src/overlay-plugins/host.ts`). No new architecture.

`createOverlayPluginHost` guards loading and `start` and has a `disable(plugin, reason)`, but it registered the overlay a plugin returned as-is, and the window then called into it unguarded: `entry.overlay.onOpen()` in `web/src/shared/contributed-overlays.ts`, `contributed.render(...)` in `web/src/pickers/PickerOverlays.tsx` and `web/src/pickers/picker/overlay-props.ts`, and `contributed.onKey(e)` in `web/src/useWindowKeys.ts`. The only error boundary in the client was `PluginErrorBoundary` in `web/src/plugins/PluginBody.tsx`, for tab plugins. A throw while rendering the clipboard-history popup unmounted the whole React root; a throw in `onKey` escaped the window key handler on every keystroke while the plugin stayed enabled. That breaks `ai/guidelines/plugins.md` §7: no unguarded call across the plugin boundary.

## Goal

A throw from any of an overlay's three host-called hooks closes the overlay (returning focus), disables that plugin with its reason through the host's existing `disable` path (which reports to the notifications feed and withdraws its chord and command word), and leaves the window running.

## Approach

1. `guardOverlay(overlay, fail)` returns a `ContributedOverlay` with the same name and command-bar claim whose `onKey` and `onOpen` catch and `fail(errorFirstLine(error))`, and whose `render` returns an element that calls the plugin's `render` *inside* a small error boundary — so a throw from the call itself and one from anything it rendered are both caught and reported from the commit phase, not as a state update in the middle of another component's render.
2. In `host.ts`, the started overlay is wrapped before `registerContributedOverlay`, with `fail` closing the overlay and calling `disable`.

The wrapping stays inside the overlay-plugins feature, so `shared/contributed-overlays.ts` remains unaware of plugins.

## Tests

- New `web/src/overlay-plugins/guarded-overlay.test.tsx`: calls pass through unchanged when nothing throws; a throwing render function and a throwing rendered component are contained (the rest of the tree still renders) and reported; a throwing `onKey` and `onOpen` do not escape and are reported.
- `web/src/overlay-plugins/host.test.ts`: a plugin whose key handler throws is disabled with its reason, its overlay leaves the screen, its command word stops answering, and it cannot be re-activated; a plugin whose open hook throws is disabled and leaves nothing on screen.
- The overlay, picker, shared, window-key, and App suites keep passing.

## Out of scope

- A shared error-boundary component for tab and overlay plugins (the tab one lives in the plugins feature; sharing it would be a cross-feature change).
