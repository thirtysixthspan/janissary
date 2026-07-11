# Let the notifications tab and file navigator share a sidebar via a tabbed interface

**Complexity: 6/10** — a real feature addition (new server displacement rule, new
client-side sidebar-internal tab-switcher state/UI), but mechanically bounded: no
environmental uncertainty, everything is synchronously testable, and only two existing
tests assert the invariant being relaxed.

## Goal

Today, docking the notifications tab and the file navigator into the same sidebar side
always displaces whichever one was already there — only one of the two dockable kinds
can occupy a side at a time. They should instead be able to share a side, switching
between them via a small tab interface within the sidebar.

## Background (verified)

- `src/tab-manager.ts:185-200` (`setDock`) is the **sole enforcement point** for the
  one-tab-per-sidebar rule: `const occupant = this.tabs.find((t, i) => i !== index && t.dock === dock);` —
  it displaces *any* existing occupant of that side, regardless of view kind. Both
  `src/file-tree-manager.ts:47,55` and `src/notifications-tab.ts:23,27` (the only
  callers of `setDock`) rely entirely on this one function for the displacement
  behavior; neither has its own additional check.
- Exactly **two** existing tests assert cross-kind displacement specifically (found via
  targeted grep for `'occupant'`/`'displaces'`, not the broader "dock" keyword, which
  also matches ~60 unrelated assertions about width/active-tab/etc. that this fix
  doesn't touch):
  - `src/controller.test.ts:1394` (`'docking into an occupied side displaces the
    previous occupant back to center'`) — uses **two file-tree tabs** on the same side.
    This is **same-kind** displacement, which this fix intentionally preserves
    unchanged (two file trees still can't share a sidebar — only file+notifications
    can). No change needed to this test.
  - `src/controller.test.ts:1526` (`'docking the notifications tab displaces a file
    navigator already in that sidebar'`) — this is the **cross-kind** case this fix
    changes. Needs rewriting to assert both stay docked instead.
- `web/src/Sidebar.tsx` currently does `tabs.map(...).find((e) => e.tab.dock === side)`
  — a single match, `if (!entry) return null`. It renders exactly one content component
  (`FileTreeTab` or `NotificationsTab`) inside one `.sidebar-strip` (label + close
  button, added by a prior fix). There is no internal "which of several docked tabs is
  currently shown" concept at all today.
- `web/src/Sidebar.test.tsx` — every existing test docks exactly **one** tab per side.
  Since the rewritten `Sidebar` falls back to `entries[0]` when nothing else is
  selected, and the new tab-switcher only renders when `entries.length > 1`, all
  existing single-entry tests should keep passing unmodified (verified by reading each
  one — none assert on the *absence* of a switcher element, so this is safe but should
  still be confirmed by running them).
- `specs/sidebars.md` states the invariant in three places (lines 10-14, 16-18, 59-60)
  that all need updating; `specs/notifications.md:30-35` and
  `specs/file-tree-tab.md:138` each restate it once.
- Sidebar width is documented as purely **client-side, ephemeral display state**
  (`specs/sidebars.md:52-54`) with no server involvement — "which of the sidebar's
  (now up to two) docked tabs is currently visible" is the same kind of concept and
  fits the same category: new local React state, never sent to the server, never
  persisted.

## Approach

1. **Server**: restrict `setDock`'s displacement to same-view-kind only, so a file-tree
   tab only displaces another file-tree tab, and a notifications tab only displaces
   another notifications tab — file+notifications now coexist on one side.
2. **Client**: `Sidebar.tsx` finds *all* entries docked to its side (up to two, since
   only two kinds are dockable), tracks which one is currently visible in local state
   (defaulting to whichever was just newly docked), and renders a small tab-switcher
   row above the existing `.sidebar-strip` only when both are present. The close
   button in `.sidebar-strip` continues to close whichever tab is currently visible.

## Implementation

1. **`src/tab-manager.ts:195`** — change:
   ```ts
   const occupant = this.tabs.find((t, i) => i !== index && t.dock === dock);
   ```
   to:
   ```ts
   const occupant = this.tabs.find((t, i) => i !== index && t.dock === dock && t.view === tab.view);
   ```

2. **`web/src/Sidebar.tsx`**
   - Replace the single `.find(...)` with `.filter(...)`, keep the early `return null`
     when empty.
   - Add local state for which docked view is currently shown:
     `const [selectedView, setSelectedView] = useState<'files' | 'notifications'>('files');`
   - Track previously-seen docked labels in a ref, and auto-select a newly-docked tab
     (mirrors the app's existing "docking always brings the tab into view" philosophy
     used for undocking-to-center, applied here to the sidebar-internal view):
     ```ts
     const previousLabelsRef = useRef<Set<string>>(new Set());
     useEffect(() => {
       const newlyDocked = entries.find((e) => !previousLabelsRef.current.has(e.tab.label));
       if (newlyDocked) setSelectedView(newlyDocked.tab.view as 'files' | 'notifications');
       previousLabelsRef.current = new Set(entries.map((e) => e.tab.label));
     });
     ```
   - Resolve the visible entry: `const current = entries.find((e) => e.tab.view === selectedView) ?? entries[0];`
   - Render a tab-switcher row above `.sidebar-strip`, only when both are present:
     ```tsx
     {entries.length > 1 && (
       <div className="sidebar-tabs">
         {entries.map((e) => (
           <button
             key={e.tab.view}
             type="button"
             className={`sidebar-tab-switch${e === current ? ' active' : ''}`}
             onClick={() => setSelectedView(e.tab.view as 'files' | 'notifications')}
           >
             {e.tab.title ?? e.tab.label}
           </button>
         ))}
       </div>
     )}
     ```
   - Use `current` (not `entry`) everywhere else in the render (the strip's label/close
     button, and the `FileTreeTab`/`NotificationsTab` branches' `index`/props).

3. **`web/src/theme.css`** — add, near `.sidebar-strip`:
   ```css
   .sidebar-tabs { display: flex; background: var(--bg-soft); border-bottom: 1px solid var(--border); }
   .sidebar-tab-switch {
     flex: 1; background: transparent; border: none; cursor: pointer; color: var(--muted);
     padding: 4px 8px; font-size: 12px; border-bottom: 2px solid transparent;
   }
   .sidebar-tab-switch.active { color: var(--fg); border-bottom-color: var(--accent); }
   ```

## Tests

- `src/controller.test.ts:1526` — rewrite `'docking the notifications tab displaces a
  file navigator already in that sidebar'` to
  `'docking the notifications tab into a sidebar already holding a file navigator lets both share it'`:
  after `files right <root>` then `notifications right`, assert **both** tabs still
  have `dock === 'right'`.
- `src/controller.test.ts` — add a new test confirming same-kind displacement still
  works: docking a *second* notifications... (not applicable, singleton) — instead add
  a test docking a second file-tree tab into a side that already holds a notifications
  tab, confirming the file tab displaces only a prior file tab, not the notifications
  tab (i.e., three-way scenario: notifications + file A docked, then file B docks →
  file A undocked, notifications and file B remain).
- `web/src/Sidebar.test.tsx` — add tests: renders a tab-switcher when both a file tree
  and notifications tab are docked to the same side; clicking the inactive switcher tab
  changes which content renders; the close button closes whichever tab is currently
  visible (its own `index`, not the other one's); docking a second tab (rerender with a
  new entry added) auto-switches the visible content to it.

## Verification

Manual: run the web app, dock the file navigator into the left sidebar (`files left`),
then dock the notifications tab into the same side (`notifications left`), and confirm
both remain docked with a small tab-switcher letting you flip between them; confirm
closing one closes only that one, leaving the other still docked. Not runnable in this
environment — note as unverified manually.

## Out of scope

- Persisting which sidebar-internal tab was last selected — ephemeral, resets on
  relaunch, same as sidebar width.
- Any keyboard shortcut for switching between the two docked tabs — mouse/click only,
  matching how the existing dock-cycle buttons work.
- The tab-focus keyboard-shifting issue and the auth-loss issue in `work/issues.md` —
  unrelated.
