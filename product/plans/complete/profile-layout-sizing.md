# Profile layout sizing

## Summary

Feature request (verbatim from `product/backlog/features.md`): "profiles should be able to specify the size of the application window, the sidebars, and upper and lower tab areas."

A profile gains a new reserved `_layout.json` file, mirroring the existing `_monitors.json` / `_files.json` / `_notifications.json` / `_schedules.json` pattern, that declares the desired size of the OS application window, the left/right sidebars, and the split between the upper action-tab area and the lower reporting-tab area. These sizes are applied every time `profile launch <name>` runs, including relaunches, overriding whatever the user had manually resized things to.

## Design decisions

- **Centralized, not per-entry.** Layout sizes live in one reserved `_layout.json` file at the profile root, not repeated as fields on every agent/harness entry. This was the user's explicit correction after an initial round considered per-entry fields.
- **Applies on every launch, including relaunch.** `profile launch <name>` reapplies `_layout.json` every time, matching the existing relaunch semantics where tabs, schedules, and workspace clones are always re-based to "now."
- **Partial config resets the rest to app defaults.** Any dimension `_layout.json` doesn't mention snaps back to the app's built-in default (1280x800 window, 300px sidebars, the reporting section's current default height percentage) rather than being left at whatever it currently is.
- **No clamping.** A profile's sizes are applied exactly as specified, even if they exceed the manual-drag limits (`MIN_WIDTH_PX`/`MAX_WIDTH_PCT` on sidebars, `MIN_PCT`/`MAX_PCT` on the reporting split) or the screen's own bounds. The profile's numbers are trusted as authoritative.
- **No-op under `--no-open`.** When the server was started with `--no-open` (no application window opened, no CDP session, no browser client necessarily connected), `_layout.json` is ignored entirely — no resize attempt, no report note, and it is not queued for a later connection.
- **Field shape.** `_layout.json` is a single JSON object (not an array, unlike the other reserved files) nested under one `layout` key:
  `{ "layout": { "window": { "width": 1440, "height": 900 }, "sidebarLeft": 320, "sidebarRight": 280, "tabAreaPct": 75 } }`
  `window.width`/`window.height` are pixels, matching the current `--window-size` launch flag's units. `sidebarLeft`/`sidebarRight` are pixels, matching `Sidebar.tsx`'s `DEFAULT_WIDTH_PX`. `tabAreaPct` is 0-100 and is the upper action area's share of the vertical split (mirroring `ReportingSection.tsx`'s `DEFAULT_PCT`, which today expresses the lower reporting area's share as 20 — i.e. `tabAreaPct: 80` is the current default).

## What already exists (reuse, don't rebuild)

| Concern | Existing code |
| --- | --- |
| Reserved profile-root config file pattern (`_monitors.json`, `_files.json`, `_notifications.json`, `_schedules.json`) | `src/profile-reserved-files.ts`, `src/profiles.ts` |
| Profile launch orchestration — opens entries, then each reserved-file feature, in order | `src/profile/agent-opener.ts` |
| Sidebar width: client-side state + drag-to-resize divider | `web/src/Sidebar.tsx`, `web/src/drag-resize.ts` |
| Reporting/tab-area height split: client-side state + drag-to-resize divider | `web/src/ReportingSection.tsx` |
| Server → client discrete event union (alongside the full-state snapshot) | `src/protocol.ts` (`ServerEvent`) |
| CDP pipe session already established to the app's Chrome window, used today to load the frame-enabler extension | `src/main.ts` (`openApp`), `src/chrome-extension-loader.ts` |
| Fixed launch-time window size flag | `src/main.ts` (`--window-size=1280,800`) |

## Proposed changes

- **`src/types.ts`** — add a `ProfileLayout` type: an object with optional `window: { width: number; height: number }`, `sidebarLeft: number`, `sidebarRight: number`, and `tabAreaPct: number` fields, documented as the shape of `_layout.json`'s `layout` key.
- **`src/profile-reserved-files.ts`** — add `loadProfileLayout(profileDir): ProfileLayout | null`, reading `_layout.json` as a single object (not an array). Returns `null` when the file is absent, unparseable, not an object, or missing/malformed `layout`; individually malformed sub-fields (e.g. a non-numeric `sidebarLeft`) are dropped while valid sibling fields are kept.
- **`src/profiles.ts`** — re-export `loadProfileLayout(name)`, wrapping the reserved-file loader with `profilePath(name)`, mirroring `loadProfileSchedules`.
- **`src/cdp-window-resize.ts`** (new) — `resizeAppWindow(writePipe, readPipe, width, height): Promise<void>`, issuing the CDP calls needed to resize the app's own browser window (window lookup, then a bounds update) over the pipe transport already opened in `openApp`, mirroring the JSON-RPC-over-pipe plumbing in `src/chrome-extension-loader.ts`.
- **`src/window-resizer.ts`** (new) — a small in-process registry: `setWindowResizer(fn | undefined)` and `getWindowResizer(): fn | undefined`. Exists so server-side profile-launch code can request a window resize without creating an import cycle back into `src/main.ts` (which sits above the server in the dependency graph).
- **`src/main.ts`** — in `openApp`, once `loadFrameEnablerExtension`'s CDP pipes are confirmed live, call `setWindowResizer` with a closure over those pipes and `resizeAppWindow`. Nothing is registered when `--no-open` skipped `openApp`, or when the pipes never came up.
- **`src/protocol.ts`** — add `LayoutEvent = { t: 'layout'; sidebarLeft?: number; sidebarRight?: number; tabAreaPct?: number }` to the `ServerEvent` union, alongside the existing one-shot event kinds (`PtyDataEvent`, `PtyExitEvent`, `ByeEvent`).
- **`src/profile/layout.ts`** (new) — `applyProfileLayout(profileName, managers, notes)`. Loads `loadProfileLayout`; does nothing if `null`. When `.window` is present, calls `getWindowResizer()` and invokes it if set, appending a note like `Resized window to 1440x900.`; if unset (covers `--no-open` and any failed CDP handshake), it silently skips with no note. When any of `sidebarLeft`/`sidebarRight`/`tabAreaPct` are present, broadcasts a `LayoutEvent` carrying exactly those fields to connected clients through the existing broadcast path, appending a note like `Resized sidebars/tab area.`.
- **`src/profile/agent-opener.ts`** — call `applyProfileLayout(name, managers, notes)` alongside the other reserved-file openers (`openProfileFiles`, `openProfileNotifications`, `openProfileSchedules`).
- **`web/src/App.tsx`** — hoist sidebar width and reporting-area height-percent out of `Sidebar`/`ReportingSection`'s internal `useState` into `App`, with the same defaults and clamping behavior they have today for manual drags. Pass them down as controlled props plus setters. Add a `t === 'layout'` case to the WS message handler that calls whichever of the three setters the incoming event carries, leaving the rest untouched.
- **`web/src/Sidebar.tsx`** / **`web/src/ReportingSection.tsx`** — accept width/height-percent and their setters as props instead of owning local state; the existing drag-divider logic is unchanged, just writing through the passed-in setter.
- **`product/specs/profiles.md`** — add a "Profile-level layout" section describing `_layout.json`, mirroring how monitors/files/notifications/schedules are each documented today.

## Tests

- **`src/profile-reserved-files.test.ts`** (extend) — `loadProfileLayout` returns the parsed layout; returns `null` when the file is absent, unparseable, not an object, or missing the `layout` key; drops an individually malformed field (e.g. `sidebarLeft: "wide"`) while keeping the rest of a valid `layout` object.
- **`src/profile/layout.test.ts`** (new) — with a window resizer registered, `applyProfileLayout` invokes it with the right width/height and appends the expected note; with none registered, it skips silently (no note, no throw); with only `sidebarLeft`/`tabAreaPct` set (no `window`), it broadcasts a `LayoutEvent` carrying exactly those two fields; with `_layout.json` absent, nothing happens.
- **`src/cdp-window-resize.test.ts`** (new, mirroring `chrome-extension-loader.test.ts`'s pipe-mocking approach) — asserts the expected CDP JSON-RPC messages are written to the pipe for a given width/height.
- **`web/src/App.test.tsx`** (extend) — a `layout` WS event updates the rendered `Sidebar`/`ReportingSection` sizing; a partial event (e.g. only `tabAreaPct`) leaves the sidebar widths unchanged.
- **`web/src/Sidebar.test.tsx`** / **`web/src/ReportingSection.test.tsx`** (adjust as needed) — drag-to-resize behavior is unchanged now that width/height-percent are controlled props rather than internal state.

## Out of scope

- Clamping or screen-bounds validation of profile-specified sizes — applied exactly as given, per the user's decision.
- Per-entry layout fields — layout is profile-wide only, from the single `_layout.json`.
- Queuing layout for a later connection when the server started with `--no-open` — it's a no-op, not deferred.
- Any change to the manual drag-resize interaction itself (still free-form and unclamped by profile values).
- Persisting a user's later manual resize back into `_layout.json` — dragging after launch still only changes local runtime state, exactly as today.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: create a profile with a `_layout.json` specifying a window size, sidebar widths, and a `tabAreaPct`, along with at least one docked sidebar tab and one monitor (reporting) tab. Manually drag the sidebar/reporting dividers to different sizes, then run `profile launch <name>` again and confirm the window, sidebars, and tab-area split all snap back to the `_layout.json` values. Then relaunch the app with `--no-open` and run `profile launch <name>` again, confirming no error and no layout-related note in the output.
