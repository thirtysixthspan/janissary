# Fixed-width, renameable sidebar tab labels (reuse TabItem/TabStrip)

**Complexity: 4/10** — no new state model or protocol change; swaps `Sidebar`'s hand-rolled
mini tab-switcher markup for the existing `TabStrip`/`TabItem` components already used by the main
tab strip, which already implement fixed-width labels and rename-in-place. The bulk of the work is
threading one more prop (`tabNameMaxLength`) down through `AppShell` and updating `Sidebar.test.tsx`'s
selectors to match.

## Goal

When both the file navigator and notifications tab are docked to the same sidebar, `Sidebar.tsx`
renders its own small tab-switcher (`.sidebar-tabstrip` / `.sidebar-tab`) instead of the app's normal
tab strip. That switcher has two gaps relative to a normal tab:

1. **Not fixed width** — `.sidebar-tab-label` is `flex: 1`, so each label stretches to fill the
   available strip width rather than hugging its own (length-capped) content the way `.tab` does.
2. **Not renameable** — there is no double-click-to-rename affordance; the label is a static `<span>`.

After this change, the sidebar's tab-switcher renders through the same `TabStrip`/`TabItem`
components the main tab strip uses, so both gaps close for free: labels get the same
`tabNameMaxLength`-bounded, content-hugging width, and double-clicking the active sidebar tab opens
the same inline rename input as any other tab, committing through the same `renameTab` RPC.

## Approach

`TabStrip`/`TabItem` (`web/src/TabStrip.tsx`, `web/src/TabItem.tsx`) are already generic over any
`TabView[]` plus an index-based `onSelect`/`onClose`/`onRename` — they don't assume they're rendering
the *whole* server tab list, just whichever slice is handed to them (see how `App.tsx` already passes
`actionEntries`, a filtered slice, to the main `TabStrip`). `Sidebar` already builds exactly that
kind of filtered slice (`entries`, the tabs docked to this side) — it just renders it by hand instead
of handing it to `TabStrip`. Replace the hand-rolled markup with a `TabStrip` call, translating
`TabStrip`'s slice-relative index back to `entries[i].index` (the real server tab index) in the
`onSelect`/`onClose`/`onRename` callbacks, exactly as `App.tsx` already does via `actionEntries`.

`tabNameMaxLength` (server-driven, already tracked as state in `App.tsx`) isn't currently threaded to
`AppShell`/`Sidebar` at all, since the hand-rolled markup didn't need it. Thread it through both.

## Reuse map

| Piece | Where | What it already does |
|---|---|---|
| Fixed-width + rename tab implementation to reuse | `web/src/TabItem.tsx`, `web/src/TabStrip.tsx` | Content-hugging width (no `flex: 1` on the label), double-click-to-rename (only when `active`), commit via `onRename` |
| Precedent for handing a filtered slice + index-translated callbacks to `TabStrip` | `web/src/App.tsx:154-160` (`actionEntries`) | `onRename={(index, title) => client.renameTab(actionEntries[index].index, title)}` — the exact translation `Sidebar` needs, over `entries` instead of `actionEntries` |
| `renameTab` RPC (already dock-agnostic server-side) | `web/src/ws.ts:75` (client), `src/tab/manager.ts:230` (`renameTab`) | No `dock` check — already renames any tab by index, docked or not |
| Sidebar's existing filtered slice (just needs to feed `TabStrip` instead of hand-rolled JSX) | `web/src/Sidebar.tsx:44` (`entries`) | Already exactly the tabs docked to this side, in order |

## Implementation steps

1. **`web/src/App.tsx`** — pass `tabNameMaxLength` through to `AppShell` (~line 153):
   ```tsx
   <AppShell tabs={tabs} client={client} dropRef={dropReference} tabNameMaxLength={tabNameMaxLength}>
   ```

2. **`web/src/AppShell.tsx`** — accept `tabNameMaxLength` and pass it to both `Sidebar`s:
   ```tsx
   export function AppShell({
     tabs, client, children, dropRef, tabNameMaxLength,
   }: {
     tabs: TabView[];
     client: JanusClient;
     children: React.ReactNode;
     dropRef?: React.RefObject<CommandInputDropHandle | null>;
     tabNameMaxLength: number;
   }) {
     return (
       <div className="app">
         <Sidebar side="left" tabs={tabs} client={client} dropRef={dropRef} tabNameMaxLength={tabNameMaxLength} />
         <div className="app-center">{children}</div>
         <Sidebar side="right" tabs={tabs} client={client} dropRef={dropRef} tabNameMaxLength={tabNameMaxLength} />
       </div>
     );
   }
   ```

3. **`web/src/Sidebar.tsx`** — import `TabStrip`, accept `tabNameMaxLength` (default `16` to match
   `App.tsx`'s own initial state, so existing call sites/tests that omit it don't break), and replace
   the hand-rolled `.sidebar-tabstrip` block with:
   ```tsx
   const activeIndex = entries.findIndex((e) => e === current);
   ...
   <TabStrip
     tabs={entries.map((e) => e.tab)}
     activeTab={activeIndex}
     onSelect={(i) => setSelectedView(entries[i].tab.view as 'files' | 'notifications')}
     onClose={(i) => client.send({ method: 'closeTab', params: { index: entries[i].index } })}
     onRename={(i, title) => client.renameTab(entries[i].index, title)}
     tabNameMaxLength={tabNameMaxLength}
   />
   ```
   Remove the now-unused `.sidebar-tab*` JSX; keep the rest of `Sidebar`'s body (divider, `FileTreeTab`/`NotificationsTab` rendering) unchanged.

4. **`web/src/theme.css`** — remove the now-dead `.sidebar-tabstrip` / `.sidebar-tab*` rules
   (`:472-483`). Add a narrow selector so the reused `.tabstrip` picks up the sidebar's own
   bottom border, mirroring what `.sidebar-tabstrip` provided:
   ```css
   .sidebar-body > .tabstrip { border-bottom: 1px solid var(--border); }
   ```

## Tests

- **`web/src/Sidebar.test.tsx`** — update existing selectors from `.sidebar-tab-close` to `.tab-close`
  and `.sidebar-tab` to `.tab` (the underlying markup class changes; the test *intent* — one strip
  entry per docked tab, closing the right one, switching content on click — is unchanged, so these
  are selector updates, not new assertions).
- Add two new tests to the same file:
  - `double-clicking the active sidebar tab opens a rename input, and committing it renames via renameTab` — dock two tabs, click the first to make it active, `fireEvent.doubleClick` its label, change the input value, blur/Enter, assert `client.send` (or a `renameTab` spy on the client) was called with `{ method: 'renameTab', params: { index: <real index>, title: <new title> } }`.
  - `sidebar tab labels do not stretch to fill the strip` (or equivalent) — render two very
    differently-named docked tabs and assert the rendered `.tab` elements don't carry `flex: 1`/full-width
    styling (e.g. assert the `.sidebar-tab-label` class no longer exists in the DOM, confirming the
    old stretch rule is gone).

## Spec update

- **`product/specs/sidebars.md`** — "The sidebar strip" section (`:51-57`) describes each entry as
  carrying "that tab's name and its own close button (×)" with no mention of width or renaming.
  Update it to note the strip now behaves like the central tab strip in both respects: labels are
  fixed-width (content-hugging, bounded the same way a normal tab's is) and a docked tab can be
  renamed the same way — double-click its label while it's the visible one.

## Out of scope

- `ReportingSection.tsx`'s monitor tab strip — it also hand-rolls `.tab`/`.tab-close` markup instead
  of using `TabItem`, but the issue only names the file-navigator/notifications sidebar; reporting
  tabs are a separate, unrelated tab class (see `isReportingTab`) and aren't renameable today either.
  Not touched here.
- Any change to `renameTab`'s server-side behavior, protocol, or the rename character limit — all
  already dock-agnostic and reused as-is.
