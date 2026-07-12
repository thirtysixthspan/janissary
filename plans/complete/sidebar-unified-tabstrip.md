# Fix: give the sidebar one tab strip instead of a separate switcher + label row

**Complexity: 3/10** — a contained refactor of `Sidebar.tsx` plus its CSS: collapse the two-part sidebar header (a conditional tab-switcher and a separate current-tab strip) into a single always-present tab strip, one entry per docked tab. No server change, no protocol change; only `Sidebar.tsx`, its CSS block, and its test.

## Goal

When both the file navigator and the notifications tab are docked in one sidebar, the sidebar shows **two** separate pieces of chrome: a row of switcher buttons (`.sidebar-tabs`) to pick which view is visible, and below it a separate strip (`.sidebar-strip`) showing the current view's name and a close button. This should instead be a single tab strip, like the central section's tab strip — one entry per docked tab, each showing the tab's name, the active one highlighted, and each carrying its own close button.

## Approach

Model it on the central `TabStrip`/`TabItem`: a flex strip (`.sidebar-tabstrip`) of tab entries (`.sidebar-tab`), the selected one marked `.active`, each with its own close button. Clicking an entry selects that docked view (the existing local `selectedView` state); clicking an entry's × closes that specific tab.

The central `TabItem` isn't reused directly: its `onSelect(index)` activates a center tab (docked tabs are never the active tab — the sidebar only switches which docked view is *shown*, via local state), and it carries agent-tab chrome (rename, group-color border, dot, unread badge) that doesn't apply to the two fixed dockable views. So the sidebar keeps its own small, dedicated strip — "similar to the central section" in shape (a strip of labelled, closable, highlightable tabs), not a literal reuse.

Concretely, in `Sidebar.tsx`:
- Remove the `entries.length > 1` `.sidebar-tabs` switcher block and the separate `.sidebar-strip` label+close block.
- Render one `.sidebar-tabstrip` (always, for one or two docked tabs) mapping each entry to a `.sidebar-tab` (marked `.active` when it is the current view) containing a `.sidebar-tab-label` and a `.sidebar-tab-close` button. Selecting is an entry-level click that sets `selectedView` to that entry's view; the close button stops propagation and sends `closeTab` for that entry's own index.
- The body below (the `FileTreeTab` / `NotificationsTab` for `current`) is unchanged.

This removes the "separate tabbed UI": the strip is the only header, and it doubles as both the switcher and the per-tab close affordance.

## Behavior change

Previously the single strip's close button closed "whichever view is currently visible". Now each tab entry has its own close button that closes that entry's tab — matching the central strip, where every tab's × closes that tab. Selecting a view and scrolling/close semantics are otherwise unchanged, as is auto-switching to a newly-docked tab.

## Implementation steps

1. In `Sidebar.tsx`, replace the `.sidebar-tabs` + `.sidebar-strip` markup with a single `.sidebar-tabstrip` of `.sidebar-tab` entries (label + per-entry close), keyed by view, active-marked on the current view.
2. In `theme.css`, replace the `.sidebar-tabs` / `.sidebar-tab-switch` / `.sidebar-strip` rules with `.sidebar-tabstrip` / `.sidebar-tab` (+ `.sidebar-tab.active`); keep `.sidebar-tab-label` and `.sidebar-tab-close`.
3. Run `./scripts/run.mjs check-diff`.

## Tests (`web/src/Sidebar.test.tsx`)

Update the existing tests to the unified strip and add coverage:
- A single docked tab renders one `.sidebar-tab` entry with a close button; clicking it sends `closeTab` for that tab (replaces the old `.sidebar-tab-close` single-strip test — the class name is preserved so the assertion still holds).
- Two docked tabs render two `.sidebar-tab` entries (replaces the `.sidebar-tab-switch` count test).
- Clicking the inactive entry switches which content renders (unchanged behavior; still `fireEvent.click(getByText('notifications'))`).
- Each entry's close button closes **that** entry's tab: the notifications entry's × sends `closeTab` for its index, and the files entry's × sends `closeTab` for its index (replaces the "closes whichever is visible" test, reflecting the per-tab close change).
- Docking a second tab still auto-switches the visible content to it (unchanged).

## Out of scope

- The central tab strip, `TabStrip`/`TabItem` — untouched.
- Adding dots, group colors, unread badges, or rename to sidebar tabs — the sidebar has two fixed view tabs; keep the strip minimal.
- Any change to docking rules, which tabs are dockable, sidebar resize, or the docked bodies themselves.

## Verification

- `./scripts/run.mjs check-diff` passes (lint, typecheck, web tests, and the CSS lint in the full gate).
- Manual: dock both the file navigator and notifications into one sidebar; confirm a single tab strip with two entries (no separate switcher + label row), that clicking an entry switches the view and highlights it, and that each entry's × closes that tab. Not runnable headless here; covered by the component tests.
