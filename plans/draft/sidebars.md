# Sidebars for the file navigator

**Complexity: 6/10** — a real state machine (docked/active invariant, one-occupant-per-side displacement) plus a new RPC and a new resizable UI module, but every mechanism reuses a verified existing precedent (`ReportingSection`'s resize, `MountedViewLayers`'s extraction, `App.tsx`'s index-preserving strip filtering) rather than inventing new patterns.

## Summary

Add a left and right sidebar to the web UI, both hidden by default. The file navigator (currently only ever a central tab) becomes placeable in three locations: left sidebar, central tab window, or right sidebar. A new button in the file navigator's header cycles through the three locations. Sidebars are resizable by dragging their inner border with the mouse. The `files` command gains a positional keyword to open directly into a sidebar.

## Decisions (confirmed with user)

1. **Location ownership: server-owned.** The dock location is part of the tab model, broadcast in the shared protocol; the server owns transitions. Sidebar *width*, by contrast, is pure client-side view chrome — client `useState`, unpersisted, matching the `ReportingSection` height precedent. Sidebar *visibility* is derived: a sidebar renders exactly when some tab is docked to it.
2. **`files` command syntax: positional keyword.** `files left [path]` / `files right [path]`, defaulting to today's center-tab behavior when omitted. A directory literally named `left`/`right` is still reachable as `files ./left`; the spec and docs note this.
3. **Tab strip visibility: disappears entirely.** While docked, the file tab is not rendered in the central tab strip — no duplicate representation.
4. **Sidebar stacking: one tab at a time.** Docking into an occupied sidebar displaces the previous occupant, which **returns to the center tab strip** (non-destructive; nothing is closed as a side effect of docking).
5. **Persistence: resets on relaunch.** No code needed — file tree tabs are already live, in-memory views that are never persisted or rehydrated (`specs/file-tree-tab.md`), and sidebar width is ephemeral client state.

## Verified codebase facts that shape the design

- **RPC indices are positions in the full tab array.** Every file-tree RPC (`fileTreeToggle`, `fileTreeCollapseAll`, `fileTreeReroot` — `src/message-handler.ts:50-54`, `src/controller.ts:155-168`) and `closeTab`/`setActiveTab` are keyed by index into the server's `tabs[]`, which the client mirrors as the `TabView[]` snapshot. Therefore a docked tab **must stay in the array and in the broadcast** — filtering it out of `TabManager.view()` would desynchronize every index-keyed RPC. Hiding it from the strip is a client-side rendering concern.
- **The client already filters the strip without disturbing indices.** `App.tsx:56-57` builds `actionEntries`/`reportingEntries` via `tabs.map((tab, index) => ({ tab, index })).filter(...)` — docked tabs become a third filtered class using the same pattern.
- **`FileTreeManager.rebuild()` clobbers `tab.files` wholesale** (`src/file-tree-manager.ts:137`: `tab.files = { root, rows }`) on every watcher-driven refresh. A location field stored inside `FileTreeView` would be silently wiped. The dock field must live on the `Tab`/`TabView` itself, not inside `files`.
- **The active tab drives everything central**: `TabManager.cur()` routes commands, `ViewTabBody` renders `tabs[activeTab]`, and App's transcript/command area keys off `current`. If a docked tab were active, the tree would render twice (sidebar + `ViewTabBody`) and command routing would target a hidden tab. So the server must maintain an invariant: **a docked tab is never the active tab**.
- **Layout**: `.app` is a column flex (`theme.css:25`) stacking TabStrip / view bodies / command area / ReportingSection. Harness/editor/shell layers are `display:none`-toggled flex children (`MountedViewLayers.tsx`), *not* absolute overlays, so wrapping the existing column in a horizontal row is safe.
- **Resize precedent**: `ReportingSection.tsx:36-48` (`onDividerDown`) — mousedown adds window mousemove/mouseup listeners, clamps, stores in local `useState`. Swap `clientY`/`innerHeight` for `clientX` and pixel widths.
- **Screenshots are automated**: `scripts/docs-screenshots/` (`capture.mjs`, `manifest.mjs`) drives `data-doc-shot` attributes (e.g. `FileTreeTab.tsx:95`). New docs screenshots mean a manifest entry, not a manual capture.
- **File-size limit**: `App.tsx` is near the 200-line ceiling; sidebar UI must be a new module, following the `MountedViewLayers` extraction precedent.

## Proposed changes

### 1. Protocol / tab model

- Add `dock?: 'left' | 'right'` to `Tab` (`src/types.ts`) and `TabView` (`src/protocol.ts`). Absent means center — existing behavior is the zero-value, no migration.
- `TabManager.view()` passes `dock` through. The tab stays in the array regardless of dock state (see facts above).
- New `TabManager` invariant helpers:
  - `setDock(index, dock)` — sets/clears `dock`; when docking the currently active tab, first moves `activeTab` to the nearest non-docked tab; when undocking to center, makes the tab active. Enforces one-per-side: docking into an occupied side clears the occupant's `dock` (it returns to the strip, per decision 4).
  - `setActiveTab` and `moveTab` (Ctrl-Tab cycling) skip docked tabs so a docked tab can never become active.

### 2. RPC

- New message `fileTreeSetDock { index, dock: 'left' | 'right' | null }` routed through `src/message-handler.ts` → `controller.ts` → `TabManager.setDock`, alongside the existing fileTree RPCs. Explicit set (not "cycle") keeps the server dumb and testable; the cycle order lives in the button's click handler.

### 3. `files` command

- Parsing lives where it does today, in `FileTreeManager.open()` (`src/file-tree-manager.ts:29`): extract an optional leading `left`/`right` keyword before the path. `src/commands/files.ts` is unchanged apart from its doc comment.
- Behavior matrix:
  - `files [path]` — exactly today's behavior; if a tree on that root exists **docked**, focusing means: undock it to center and make it active (it must be visible somewhere the user is looking).
  - `files left [path]` / `files right [path]` — if a tree on that root already exists (docked anywhere or in the strip), move it to the requested sidebar; otherwise create the tab (still via `openFilesTab`, so labels/groups work as today) and immediately dock it. Either way the displaced occupant, if any, returns to center.
- Creation while docking still runs through `addFilesTab` (`src/tab-creators.ts:78`) so label uniqueness, group membership, and title behavior stay intact; the tab simply carries `dock` and isn't rendered in the strip until undocked.

### 4. Web UI — layout and sidebar containers

- Restructure the root: `.app` becomes a horizontal row containing `Sidebar(left)` / `.app-center` (a new column div wrapping everything App renders today) / `Sidebar(right)`. CSS change in `theme.css` plus one wrapper div in `App.tsx`.
- New module `web/src/Sidebar.tsx` (keeps `App.tsx` under the line limit), owning:
  - Deriving its docked entry: `tabs.map((tab, index) => ({ tab, index })).find((e) => e.tab.dock === side)` — same index-preserving pattern as `actionEntries`.
  - Rendering `null` when nothing is docked (sidebar hidden by default).
  - Width state: local `useState`, pixel-based, default ~280px, clamped (min ~180px, max ~50% of window), applied via `flex: 0 0 <px>`.
  - A `.sidebar-resize` divider on its inner edge (right edge of left sidebar, left edge of right sidebar), `cursor: col-resize`, using the `onDividerDown` listener pattern from `ReportingSection`.
  - Mounting `<FileTreeTab files={...} client={client} index={...} />` unchanged.
- `App.tsx`: exclude docked tabs from `actionEntries` (they leave the strip); `ViewTabBody`/transcript rendering needs no change because the server guarantees a docked tab is never active.
- `FileTreeTab` mount-time autofocus (`FileTreeTab.tsx:26`) would steal focus from the command bar whenever a dock move remounts the tree — gate it behind an `autoFocus` prop (true for center, false for sidebar mounts). Row-selection state resetting on remount is acceptable.
- CSS: `.sidebar`, `.sidebar-resize` in `theme.css`, styled parallel to `.reporting-resize` (`theme.css` ~309-316).

### 5. Web UI — `files-header` buttons

- In `FileTreeTab.tsx:96-109`, next to `.files-collapse-all`:
  - **Location cycle button**: sends `fileTreeSetDock` with the next location in the cycle left → center → right → left (from the tab's current `dock`). Tooltip names the destination (e.g. "Move to right sidebar"). `FileTreeTab` needs the tab's current `dock` — pass it as a prop.
  - **Close button (×)**, shown at least while docked: a docked tree loses its strip × and, being never-active, can't be closed by `close`-on-current-tab either; the header × sends the existing `closeTab` RPC with the tree's index. (`close files` by label still works as a fallback.)
- Styling follows the existing transparent icon-button pattern.

### 6. Tests (colocated, run via `./scripts/run.mjs check-diff`)

- `src/file-tree-manager.test.ts`: keyword parsing (`files left`, `files right`, bare, `./left` literal path); re-dock of an existing root; displacement returns previous occupant to center; docked-tab focus behavior of bare `files`.
- `src/tab-manager.test.ts` (or wherever TabManager is covered): `setDock` invariants — active tab never docked, `moveTab` skips docked tabs, one occupant per side, undock restores strip presence and activates.
- `src/message-handler.test.ts` / `src/controller.test.ts`: `fileTreeSetDock` routing, mirroring the existing fileTree RPC tests.
- `web/src/Sidebar.test.tsx`: hidden with no docked tab; renders the docked tree; drag clamps width to min/max.
- `web/src/FileTreeTab.test.tsx`: cycle button sends the right `fileTreeSetDock` payload per current dock; header × sends `closeTab`; autofocus suppressed in sidebar mode.
- App-level: docked tab absent from the strip while remaining RPC-addressable.

### 7. Specs

- `specs/file-tree-tab.md` — amend in place:
  - `files [path]` section: the `left`/`right` keyword, the behavior matrix above, and the `./left` escape hatch.
  - "Tab strip: name and close button" section: docked trees leave the strip; header gains the location button and (while docked) a close button.
  - "Reordering and grouping": grouping/contiguity language applies while in the strip; a docked tab keeps its group membership latent and returns to its position on undock.
- New `specs/sidebars.md`: sidebar mechanics — hidden by default, one docked panel each, derived visibility, mouse-resizable inner border with clamps, the server-owns-dock / client-owns-width state split, active-tab invariant, and that only the file navigator can dock today (the `dock` field is deliberately on `TabView`, not `FileTreeView`, so other view kinds can dock later).
- `specs/tabs.md`: one cross-referencing sentence where contiguity/strip membership is described (tabs can be temporarily out of the strip while docked; see `sidebars.md`).

### 8. Public documentation

- `public-documentation/tab-types/file-navigator.md`: document the three locations and the `files left|right` forms, add the location button and docked-× to the Mouse table, and qualify the "placed at the start of its group" and "Files opened from the tree land in the same group" notes for the docked case (opened files still land in the tree's group — group membership is retained while docked).
- `public-documentation/getting-started/tabs.md`: brief mention that the file navigator can dock to a sidebar, linking to the file-navigator page.
- Screenshot of a sidebar-docked navigator: add a `data-doc-shot` target and a `scripts/docs-screenshots/manifest.mjs` entry; regenerate rather than hand-capture.

## Out of scope

- Docking any tab kind other than the file navigator (the `dock` field lives on `Tab`/`TabView` rather than `FileTreeView` specifically so this can extend later, but no other view kind gains dock support in this plan).
- Persisting dock placement or sidebar width across relaunch (decision 5 — both reset).
- More than one tab per sidebar, or sidebars stacking/tabbing multiple docked panels.
- Keyboard shortcuts for docking/undocking (only the header cycle button and the `files left|right` command).

## Verification

- `./scripts/run.mjs check-diff` after each implementation step.
- Manual end-to-end check: `files left` to dock a tree into the left sidebar, confirm it disappears from the tab strip and the sidebar renders with a resize divider; drag the divider and confirm width clamps at the min/max; `files right ~/some/other/dir` to dock a second, different tree on the right, confirm both sidebars show independently; run `files left` again with a third path and confirm the left sidebar's previous occupant returns to the center tab strip (not closed); click the docked tree's header location-cycle button through left → center → right → left and confirm the tab strip updates each time; confirm the docked tree is never selectable as the active tab (e.g. via `next`/tab-cycling) and that closing it via its header × works.

## Implementation order

1. Server model: `dock` field on `Tab`/`TabView`, `TabManager.setDock` + active-tab/cycling invariants, tests.
2. Server RPC: `fileTreeSetDock` routing, tests.
3. Server command: `left`/`right` keyword in `FileTreeManager.open()` with the behavior matrix, tests.
4. Web layout: `.app` row restructure + `Sidebar.tsx` with resize (verify drag UX with a docked tab created via `files left`), strip filtering in `App.tsx`, tests.
5. Web header: cycle button, close button, `autoFocus` prop, tests.
6. Specs: `file-tree-tab.md` amendments, new `sidebars.md`, `tabs.md` cross-reference.
7. Public docs + screenshot manifest entry.

Each step leaves the app working; run `./scripts/run.mjs check-diff` after each.
