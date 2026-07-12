# Shifting keyboard focus between application sections

**Complexity: 4/10** — client-only view wiring with no server, protocol, or persistence change, but correctness hinges on a capture-phase key interception ordered ahead of xterm and on section-presence / current-section resolution, coordinated across ~6 web files plus one spec and two doc surfaces.

## Problem

The UI is composed of up to four **application sections** — the center action area, the left sidebar, the right sidebar, and the lower reporting section — and each may hold multiple tabs. Today there is no keyboard way to move focus *between* sections. `useFocusOnTabSwitch` only lands focus within the center section when the active center tab changes; the sidebars and reporting section can only be reached with the mouse. A keyboard user working in a terminal cannot jump to the file tree, the notifications tab, or a monitor without leaving the keyboard.

We want a single chord that cycles keyboard focus across the sections that are currently present, and when focus lands on a section, its currently-visible tab receives focus.

## The sections (as they exist today)

Derived entirely on the client from the `tabs: TabView[]` array; a section exists only when it has at least one tab (except the center, which is always present).

| Section | Root element | Present when | "Visible tab" (what receives focus) |
|---|---|---|---|
| Left sidebar | `Sidebar side="left"` | some tab has `dock === 'left'` | the sidebar's currently-shown docked tab (`Sidebar`'s local `selectedView`) — file tree or notifications |
| Center | `.app-center` | always | the server's active action tab (`activeTab`) — terminal for harness/shell tabs, else the command input |
| Right sidebar | `Sidebar side="right"` | some tab has `dock === 'right'` | same shape as the left sidebar |
| Reporting | `ReportingSection` | any reporting tab exists (`isReportingTab`, `view === 'monitor'`) | the reporting section's currently-selected monitor (`ReportingSection`'s local `selected`) |

The "visible tab" for each peripheral section is **client-side display state** already owned by that section's component (`Sidebar.selectedView`, `ReportingSection.selected`) — see `specs/sidebars.md`. Focusing a sidebar therefore never changes the server's active tab, which keeps the docked-tab "never the active tab" invariant intact.

## Binding (decided)

- **Forward only** — `Shift+Tab` moves to the next present section, in spatial order **left → center → right → reporting → (wrap back to left)**, skipping any section that has no tabs. There is **no** reverse chord; the wrap-around reaches every section in at most three presses.
- **Bare `Tab` is untouched.** It continues to complete the token at the cursor in the command line (`CommandInput.tsx:112`) and to reach the PTY for shell completion inside terminals. This is the whole reason a chord was chosen over bare Tab.

### Why `Shift+Tab` works cleanly here

`CommandInput` already returns early for `shiftKey`/`ctrlKey` (`CommandInput.tsx:110`), deferring those chords to the window-level handler — so intercepting `Shift+Tab` at the window does not disturb command-line completion. Inside terminals, xterm's own key handler would otherwise consume the key; the window listener must run in the **capture phase** (`addEventListener('keydown', handler, true)`) and call `preventDefault()` + `stopPropagation()`, so the chord is caught before xterm or the command input ever sees it, and default browser focus traversal is suppressed.

`Shift+Tab` is also the one class of chord a browser always lets the page cancel: the UI runs in the user's **default browser** (`src/main.ts:45` shells out to `open`/`xdg-open`/`start`), not Electron, so ordinary Tab/Shift+Tab focus traversal is fully interceptable — unlike `Ctrl+Tab`/`F6`/`Alt+Arrow`, which browsers reserve. That, plus dropping reverse, is why a single forward-looping `Shift+Tab` is the whole binding.

## Design

### Determine the current section from the DOM, not stored state

Rather than track an `activeSection` index (which desyncs the moment the user clicks into a section), compute the current section at keypress time by asking which section root contains `document.activeElement`. This handles mouse-driven focus for free and keeps the feature stateless. If focus is in no section (e.g. `document.body`), start from the center.

### Focus via the DOM for peripherals, existing handles for center (decided)

Resolve both "which section am I in" and "focus into a section" through the DOM, so **no imperative handle is threaded** through `AppShell`/`Sidebar`/`ReportingSection` (that plumbing — `forwardRef`/`useImperativeHandle` plus registration props — would grow three files and `App.tsx` for no gain). Each section already carries a stable root class:

- Left sidebar — `.sidebar-left` (`Sidebar.tsx:55`, the `sidebar sidebar-${side}` className)
- Right sidebar — `.sidebar-right`
- Reporting — `.reporting-section` (`ReportingSection.tsx:55`)
- Center — `.app-center` (`AppShell.tsx:12`)

**Current section** = `document.activeElement?.closest('.sidebar-left, .sidebar-right, .reporting-section, .app-center')`. `.reporting-section` is rendered *inside* `.app-center` (App renders `ReportingSection` among the AppShell children — `App.tsx:223`), so it must appear in the selector list; `closest` returns the nearest matching ancestor, which for a focused monitor is `.reporting-section`, not the enclosing `.app-center`. If `activeElement` is `null`/`body`, treat the current section as center.

**Focus into a peripheral section** = find that section root's single focusable landing element and call `.focus()`:
- Sidebar files view → `.files-tab` (already `tabIndex={0}`, `FileTreeTab.tsx:100`).
- Sidebar notifications view → `.notifications-tab` (`NotificationsTab.tsx:23`) — needs `tabIndex={0}` added.
- Reporting → `.reporting-body` (`ReportingSection.tsx:80`) — needs `tabIndex={0}` added. `MonitorTab` renders a **bare fragment with no root element** (`MonitorTab.tsx:51`), so its wrapper `.reporting-body` is the correct landing node, not MonitorTab itself.

A sidebar renders only its currently-visible view's body and the reporting section only its selected monitor, so each root holds exactly one such element; select it with `root.querySelector('[tabindex]')` — the strip's `<button>`s carry no `tabindex` attribute and won't match.

**Focus into the center** reuses the existing per-tab handles rather than the DOM (xterm's focusable node is a hidden textarea awkward to target by selector, and the handles already exist). Extract the harness PTY handle → shell PTY handle → command-input selection now inline in `useFocusOnTabSwitch` (`useFocusOnTabSwitch.ts:16-22`) into an exported `focusCenterVisibleTab(currentTab, harnessHandles, shellHandles, inputReference)`; `App` passes a `focusCenter` callback to the hook that calls it with `currentRef.current` (`App.tsx:61`, `76`). This is the only registration the hook needs.

### The nav hook

A new `useSectionNav` hook owns a **capture-phase** `window` `keydown` listener (`addEventListener('keydown', handler, true)`), separate from the bubble-phase handler in `useWindowKeys.ts:156-172` — that one never sees `Shift+Tab` from inside a terminal because xterm consumes it first. On a key event it:
1. Returns immediately unless the key is exactly `Shift+Tab`: `e.key === 'Tab' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey`.
2. Builds the ordered list of **present** sections from `tabs` — left if any `dock === 'left'`, center always, right if any `dock === 'right'`, reporting if any `isReportingTab`.
3. Resolves the current section via the `closest()` rule and finds its index in the present list (default to center's index if unresolved).
4. Advances to the next present section, wrapping the last back to the first.
5. Focuses it — `focusCenter()` for center, else `root.querySelector('[tabindex]')?.focus()` for that section's root.
6. Calls `preventDefault()` + `stopPropagation()`, so neither xterm/CommandInput nor the browser's default focus traversal acts on the key.

If center is the only present section, steps 4–5 land back on center — effectively a no-op.

## What already exists (reuse, don't rebuild)

| Need | Already in the repo | Location |
|---|---|---|
| Center focus target (terminal vs command line) | the effect body in `useFocusOnTabSwitch` | `web/src/useFocusOnTabSwitch.ts:16-22` |
| Per-tab focus handles + command-input ref | `harnessHandles`, `shellHandles`, `inputReference`, `currentRef` | `web/src/App.tsx:59-61` |
| Focusable file-tree container | `.files-tab` with `tabIndex={0}` | `web/src/FileTreeTab.tsx:100` |
| Section roots with stable classes | `.app-center` / `.sidebar-left`/`-right` / `.reporting-section` | `AppShell.tsx:12`, `Sidebar.tsx:55`, `ReportingSection.tsx:55` |
| Which peripheral tab is visible (already client-owned) | `Sidebar.selectedView`, `ReportingSection.selected` | `Sidebar.tsx:19`, `ReportingSection.tsx:34` |
| Present-section derivation inputs | `tab.dock`, `isReportingTab` | `Sidebar.tsx:39`, `ReportingSection.tsx:8` |
| Small pure helper factored out of a component (pattern to copy) | `nextDock` | `web/src/dock-cycle.ts:5` |
| Window key-listener registration pattern | `useWindowKeys` (bubble phase; ours is capture) | `web/src/useWindowKeys.ts:156-172` |

## Changes

### New — `web/src/useSectionNav.ts`
- The capture-phase keydown hook described in Design. It takes `tabs` (for presence) and a `focusCenter` callback. Keep the two pure helpers — ordered-present-sections from `tabs`, and next-section-from-current index (with wrap) — as exported functions in this file (or a sibling `section-nav.ts` if the file nears 200 lines), mirroring how `dock-cycle.ts:5` factors `nextDock` out of its component so it can be tested without a DOM. Import `isReportingTab` from `./ReportingSection` for presence.

### `web/src/useFocusOnTabSwitch.ts`
- Extract the harness PTY handle → shell PTY handle → command-input selection (`useFocusOnTabSwitch.ts:16-22`) into an exported `focusCenterVisibleTab(currentTab, harnessHandles, shellHandles, inputReference)`; call it from the existing effect and export it for `App` to pass into `useSectionNav`. Center focus stays one definition, no forked rules.

### `web/src/App.tsx`
- Add a single `useSectionNav(tabs, focusCenter)` call, where `focusCenter` invokes `focusCenterVisibleTab(currentRef.current, harnessHandles, shellHandles, inputReference)` — all four already declared at `App.tsx:59-61`. No new refs, no props threaded to `AppShell`/`Sidebar`/`ReportingSection`, no changes to those three files. App is already 234 lines, so nothing beyond the hook call belongs here.

### `web/src/NotificationsTab.tsx`
- Add `tabIndex={0}` to the root `.notifications-tab` div (`NotificationsTab.tsx:23`) so section nav can land focus on the docked notifications view. (Its existing `scrollRef` is unrelated and stays.)

### `web/src/ReportingSection.tsx`
- Add `tabIndex={0}` to the `.reporting-body` wrapper (`ReportingSection.tsx:80`) so section nav can land focus on the selected monitor. `MonitorTab` is unchanged (it has no root element to attach to — see Design).

## Documentation & specs

Per architecture principle 10, the behavior change ships its spec and docs in the same change. Every keyboard surface below must gain the `Shift+Tab` binding, and the shared "application sections" concept it introduces must be defined once and referenced.

### `specs/keyboard-navigation.md` (authoritative)
- Add a row to the key table: `Shift+Tab` → move keyboard focus to the next application section (left → center → right → reporting, wrapping back to left, skipping empty sections; the section's visible tab receives focus).
- Add a short prose paragraph defining the four **application sections** and the "visible tab receives focus" rule, so the term has one canonical definition.
- Note that bare `Tab` is unchanged (still token completion), and extend the closing note (`specs/keyboard-navigation.md:33`, "A focused file tree tab captures arrow keys…") to record that `Shift+Tab` is intercepted in the capture phase ahead of that file-tree capture and ahead of a focused harness terminal, so section navigation still escapes them.

### `specs/sidebars.md` / `specs/monitoring.md`
- Note that a sidebar / the reporting section can receive keyboard focus via section navigation, and that doing so focuses its currently-visible tab **without** changing the server's active tab (reaffirming the docked-tab "never the active tab" invariant). Cross-link `keyboard-navigation.md` as the authoritative binding.

### `help.md` (in-app help)
- Add a `Shift+Tab` row to the **Key Bindings** table (`help.md:38`) — "Move keyboard focus to the next application section (left → center → right → reporting sidebar/panel), looping; the visible tab in that section gets focus."
- Keep the existing bare-`Tab` completion row unchanged; if help.md has a `Shift+←`/`Shift+→` grouping, place the new row near the other focus/tab-movement bindings.

### `public-documentation/getting-started/keyboard.md` (VitePress)
- Add a `Shift+Tab` row to the shortcuts table (after the tab-switch/scroll rows — `keyboard.md:11-21`).
- Update the closing paragraph (`keyboard.md:31`) — which today says a harness tab "sends everything to the harness except `Shift+←`/`Shift+→`" — to also except `Shift+Tab`, so readers know section navigation escapes a focused terminal/file navigator.
- Optionally add one sentence naming the four application sections. `getting-started/application.md` does **not** currently describe the layout (verified — no sidebar/section content), so define the concept authoritatively in `specs/keyboard-navigation.md` and keep the public doc to a single sentence rather than inventing a new layout section here.

> Note: `.janissary/workspace/claude/help.md` is a workspace copy, not the source of truth — do **not** edit it; only the repo-root `help.md`.

### Tests — `web/src/useSectionNav.test.ts(x)` (+ App integration in `web/src/App.test.tsx`)
Colocated web tests run under the vitest `client` project (jsdom), matching the existing `web/src/*.test.tsx` convention.
- Pure helper: ordered-present-sections skips absent sidebars/reporting and always includes center; for a full layout it yields `[left, center, right, reporting]`.
- Pure helper: next-section-from-current wraps the last present section back to the first, and returns center when the current index is unresolved.
- Current-section resolution via `closest()` returns `.reporting-section` (not `.app-center`) for an element inside the reporting body — the nesting-precedence case that would otherwise misroute.
- `Shift+Tab` dispatched at the window while focus is in the command input advances to the next present section, and bare `Tab` is untouched (still runs completion). Assert the handler ignores `Ctrl/Meta/Alt+Tab` and plain `Tab`.
- Focusing a sidebar via section nav does **not** emit `setActiveTab` (the docked-tab invariant): spy on `client.send`.
- Regression: switching the active center tab still focuses the center target through the extracted `focusCenterVisibleTab` (guards the `useFocusOnTabSwitch` refactor).

## Verification

- **During development:** `./scripts/run.mjs check-diff` after each change — lints the changed files, incrementally typechecks the affected project, and runs the related `client` tests. (Do not run `npm run check`; that is the human's end-of-work gate.)
- **Manual end-to-end** (launch the app — use the `run` skill): open an agent tab, dock a file navigator to the left, dock notifications to the right, and start a monitor so all four sections are present. From the command line, press `Shift+Tab` repeatedly and confirm focus cycles **center → right → reporting → left → center**, with the visible tab in each section receiving focus (blinking caret / focus ring). Confirm bare `Tab` still completes a path in the command line and still reaches shell completion inside a harness/shell terminal, and that `Shift+Tab` fired from *inside* a terminal still leaves it for the next section. Undock both sidebars and the monitor and confirm those stops drop out of the cycle (only center remains → `Shift+Tab` is a no-op).

## Out of scope

- **Reverse / backward** section navigation — decided out; forward wrap only.
- Moving between the two tabs **within** one sidebar (file tree ↔ notifications) — that stays a mouse / `selectedView` action; `Shift+Tab` moves between sections, not within one.
- Any change to which tab is **active on the server**, focus persistence, or the wire protocol — the feature is entirely client-side DOM focus.
- Re-binding bare `Tab`, or adding `Ctrl+Tab` / `F6` / a directional (`Alt`+arrow) focus model (all evaluated and rejected in Binding).
