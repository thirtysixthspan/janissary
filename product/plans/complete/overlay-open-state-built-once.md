# Build the overlay open-state once, and let the close-tab chord read it

**Complexity: 5/10** — one new builder beside an existing registry, one prop replacing nine at two component boundaries, one hook signature, and the tests that pin the chord. No new architecture, no wire-protocol change; one user-visible behavior changes (Cmd+W stops closing a tab underneath four of the nine overlays).

`web/src/pickers/overlay-registry.ts` unified *which* overlay wins, but not the state fed into it. The nine-field `OverlayOpenState` literal — mapping `route`/`themePickerOpen`/`appThemePickerOpen`/`quickOpenOpen`/`navOpen`/`pickerOpen`/`queueOpen`/`taskPickerOpen`/`profilePickerOpen` onto the registry's overlay names — is spelled out by hand at three sites: the `firstOpenOverlay` switch in `web/src/pickers/PickerOverlays.tsx`, `dispatchModalKey` in `web/src/useWindowKeys.ts`, and the `blockingOverlayOpen` prop in `web/src/AppMain.tsx`.

A fourth consumer does not use the registry at all. `web/src/useCmdWRefs.ts` sets `pickerOpenRef.current = pickerOpen || queueOpen || taskPickerOpen || profilePickerOpen`, and `web/src/useCmdW.ts` returns early only when that ref, `routeRef`, or `quitConfirmOpenRef` is set. Four of the nine overlays — the syntax-theme picker, the app-theme picker, the tab navigator, and quick open — are missing from that OR, so Cmd+W pressed while one of them is on screen falls through to `closeTab` and tears down the tab underneath it, along with its live harness or agent session.

## Goal

One exported builder is the only place the nine app-level state names map onto the registry's overlay names. `App.tsx` — where those nine `useState` pairs already live — calls it once, and every consumer reads the object it returns, the close-tab chord included. Adding a tenth overlay becomes a compile error at each of the four decisions rather than a silent omission from one of them.

## Design decisions

**A builder in the registry, not a fourth hand-written literal.** `buildOverlayOpenState` sits beside `OVERLAYS` in `web/src/pickers/overlay-registry.ts` and takes the nine values under the names `App.tsx` already gives them. Its input type, `OverlayOpenSources`, is exported so the one other place that holds all nine — `StateSnapshot` in `web/src/useWindowKeys.ts` — can be declared as an intersection with it instead of restating them.

**`StateSnapshot` intersects `OverlayOpenSources` rather than carrying the built object.** The window-key snapshot must keep `route` as the full `RouteChooserView` (`handleRouteChooserKey` reads its choices), and the flat `pickerOpen`/`navOpen`/… names are what `useAppWindowKeys`'s caller supplies alongside the matching indices and row lists. Declaring `StateSnapshot = OverlayOpenSources & { … }` keeps that shape byte-identical while tying it to the registry: a tenth overlay added to `OverlayOpenSources` makes `dispatchModalKey`'s `buildOverlayOpenState(snap)` and the deps literal in `App.tsx` both stop compiling. `dispatchModalKey` then calls the builder instead of spelling the mapping, which is what removes the second hand-built literal.

**`PickerOverlays` and `AppMain` take the built object.** Both drop all nine booleans — `themePickerOpen`, `appThemePickerOpen`, `pickerOpen`, `navOpen`, `queueOpen`, `taskPickerOpen`, `profilePickerOpen`, `quickOpenOpen`, and the `route !== null` test — for a single `overlays: OverlayOpenState` prop. `route` itself stays a prop on both, because the route chooser renders from the view object, not from a boolean. `AppMain` reads `overlays.task` and `overlays.tabNav` for the mounted-view layers, and `overlays.queue` for `AgentTabBody`'s own `queueOpen` prop, so `queueOpen` leaves `AppMainProps` too.

**The chord reads `firstOpenOverlay`, not a longer OR.** `useCmdWRefs` takes the built object and sets `pickerOpenRef.current = firstOpenOverlay(overlays) !== undefined`. That is the same question the render chain and the keyboard chain ask, so the chord can no longer disagree with them.

**`routeRef` and `useCmdW`'s signature stay as they are.** `overlays.route` already covers the route chooser, so `routeRef` is now redundant for suppression — but collapsing it means moving `useCmdW`'s own arguments and the tests that pin them in the same change as its inputs. Left alone deliberately; noted as out of scope below.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The ordered registry and its two questions | `web/src/pickers/overlay-registry.ts` (`OVERLAYS`, `firstOpenOverlay`, `commandBarSuppressed`) |
| `OverlayName` / `OverlayOpenState` | same file |
| The three hand-built literals being deleted | `web/src/pickers/PickerOverlays.tsx:79`, `web/src/useWindowKeys.ts:81`, `web/src/AppMain.tsx:95` |
| The fourth, shorter definition being deleted | `web/src/useCmdWRefs.ts:17` |
| The registry's own test helpers (`NONE`, `opened`) | `web/src/pickers/overlay-registry.test.ts` |

## Implementation steps

1. **`web/src/pickers/overlay-registry.ts`: add the builder.** Export `OverlayOpenSources` — `route: RouteChooserView | null` plus the eight booleans under their app-level names — and `buildOverlayOpenState(sources: OverlayOpenSources): OverlayOpenState`, holding the one mapping. Import `RouteChooserView` as a type from `@shared/protocol`.

2. **`web/src/pickers/PickerOverlays.tsx`: take the built object.** Replace the eight boolean props with `overlays: OverlayOpenState`, keep `route`, and switch on `firstOpenOverlay(overlays)`.

3. **`web/src/useWindowKeys.ts`: intersect and call the builder.** Declare `StateSnapshot = OverlayOpenSources & { … }`, dropping the nine now-inherited fields from its literal, and change `dispatchModalKey` to `switch (buildOverlayOpenState(snap))`.

4. **`web/src/AppMain.tsx`: one prop, three readers.** Add `'queueOpen'` to the `AgentTabBody` `Omit`, drop the nine booleans from the destructure, use `commandBarSuppressed(overlays)`, pass `overlays` down to `PickerOverlays`, and read `overlays.queue` / `overlays.task` / `overlays.tabNav` where the old booleans were used.

5. **`web/src/App.tsx`: build once.** Call `buildOverlayOpenState` with the nine state values just above `useCmdWRefs`, pass `overlays={overlays}` to `AppMain` in place of the nine boolean props, and hand the same object to `useCmdWRefs`. The `useAppWindowKeys` deps literal keeps the nine flat values — that is `StateSnapshot`'s shape, now inherited from `OverlayOpenSources`.

6. **`web/src/useCmdWRefs.ts`: read the registry.** Replace the four boolean parameters with `overlays: OverlayOpenState` and set `pickerOpenRef` from `firstOpenOverlay(overlays) !== undefined`. Keep `route` and `routeRef`.

## Tests

- `web/src/useCmdWRefs.test.ts` — rewrite the case named "ORs pickerOpen with queueOpen, taskPickerOpen, and profilePickerOpen": it pins the gap by name, so it is replaced by a case per registry entry asserting that *every* overlay raises `pickerOpenRef`, plus the closed case. Driven off `OVERLAYS` so a tenth overlay is covered without a new case.
- `web/src/pickers/overlay-registry.test.ts` — new cases for `buildOverlayOpenState`: all nine closed maps to an all-false state; each source value opens exactly its own overlay; a non-null `route` opens `route`.
- `web/src/App.test.tsx` — a new case per previously-missed overlay is not renderable through the app shell for all four, so add the one that is reachable from a typed command: with the syntax-theme picker open, Cmd+W sends no `closeTab`. The existing queue-popup case must keep passing.
- `web/src/useWindowKeys.test.ts`, `web/src/useAppWindowKeys.test.ts`, `web/src/useCmdW.test.tsx` must keep passing **unchanged** — they pin the keyboard priority chain, the shared ref, and the chord's existing suppression cases, none of which this change moves.

## Out of scope

- **Collapsing `routeRef` into `pickerOpenRef`** and shortening `useCmdW`'s signature. Now possible, but it moves the chord's own arguments in the same change as its inputs.
- **Replacing the nine `useState` pairs with one reducer or context.** The item's own note says the booleans stay nine independent hooks lifted into the app root; that is a separate design change.
- **The per-overlay indices, row lists, and callbacks.** Only the open/closed booleans are unified here.
- **`AgentTabBody`'s `pickerOpen` prop**, which ORs the suppression flag with the two quit dialogs — a different question from "is an overlay open".
