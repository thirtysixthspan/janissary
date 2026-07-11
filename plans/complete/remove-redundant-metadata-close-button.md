# Remove the redundant close button from the file navigator's and notifications tab's metadata line

**Complexity: 2/10** — delete one button block in each of two files, plus its now-unused CSS.

## Goal

When the file navigator or notifications tab is docked into a sidebar, it currently shows
**two** close buttons: one in the sidebar's own strip header (`.sidebar-strip`, always
present, labeled with the tab's title), and a second, redundant one inside the tab's own
metadata line (`.files-header` / `.notifications-header`). The metadata line's close
button should be removed — the sidebar strip's close button is the sole close mechanism
while docked.

## Background (verified)

- `web/src/Sidebar.tsx:44-55` renders `.sidebar-strip` unconditionally whenever a tab is
  docked to that side, with its own label (`entry.tab.title ?? entry.tab.label`) and its
  own close button (`.sidebar-tab-close`) that sends `closeTab`. This wraps both
  `FileTreeTab` (`Sidebar.tsx:57`) and `NotificationsTab` (`Sidebar.tsx:60`).
- `web/src/FileTreeTab.tsx:124-134` additionally renders its **own** close button inside
  `.files-actions`, shown only `dock && ...`, sending the same `closeTab` RPC:
  ```tsx
  {dock && (
    <button type="button" className="files-close" title="Close" aria-label="Close tab"
      onClick={() => client.send({ method: 'closeTab', params: { index } })}>
      ×
    </button>
  )}
  ```
- `web/src/NotificationsTab.tsx:36-43` has the same pattern with `.notifications-close`.
- When centered (not docked), `dock` is `undefined`, so neither of these inner close
  buttons renders at all — center-placed tabs close via the ordinary tab-strip's own
  close (X), untouched by this change.
- The dock-cycle button (`.files-dock-cycle` / `.notifications-dock-cycle`) is **not**
  duplicated by `Sidebar.tsx` and must stay.
- Removing the inner close buttons leaves `.sidebar-strip`'s close button as the sole,
  already-functional close mechanism while docked — no behavior is lost.

## Approach

Delete the `dock && <button className="files-close" ...>` block from `FileTreeTab.tsx`
and the equivalent `<button className="notifications-close" ...>` from
`NotificationsTab.tsx`. Remove the now-unused `.files-close` / `.notifications-close`
CSS selectors from `theme.css` (keeping the still-used `.files-collapse-all` /
`.files-dock-cycle` and `.notifications-dock-cycle` rules).

## Implementation

1. **`web/src/FileTreeTab.tsx:124-134`** — remove the `{dock && (<button className="files-close" ...>×</button>)}` block from `.files-actions`.

2. **`web/src/NotificationsTab.tsx:34-42`** — remove the `<button className="notifications-close" ...>×</button>` block from `.notifications-actions`, leaving only the dock-cycle button. (Since `.notifications-actions` would then hold a single button, keep the wrapper div for consistency with `.files-actions`, unaffected by this cleanup.)

3. **`web/src/theme.css`**
   - `.files-collapse-all, .files-dock-cycle, .files-close { ... }` → drop `.files-close`
     from the selector list (keep the rule for the remaining two classes).
   - `.files-collapse-all:hover, .files-dock-cycle:hover, .files-close:hover { color: var(--fg); }` → drop `.files-close:hover`.
   - `.notifications-dock-cycle, .notifications-close { ... }` → drop `.notifications-close`.
   - `.notifications-dock-cycle:hover, .notifications-close:hover { color: var(--fg); }` → drop `.notifications-close:hover`.

## Tests

Update `web/src/NotificationsTab.test.tsx`:
- The existing test `'when docked, the close button sends closeTab'` asserts on the
  tab's own close button, which no longer exists — remove this test (the behavior it
  covered, closing via `Sidebar.tsx`'s `.sidebar-tab-close`, is exercised by
  `Sidebar.test.tsx` if present, or is otherwise out of scope for this component test).
- Update `'shows neither the dock-cycle nor close button when undocked'` to drop the
  close-button assertion, since `NotificationsTab` no longer renders one at all — rename
  to `'shows no dock-cycle button when undocked'` and assert only on the dock-cycle
  title.
- Update `'when docked left, shows the dock-cycle...'` test's assertions if it also
  checks for the close button; keep the dock-cycle assertion.

Update `web/src/FileTreeTab.test.tsx:179-187` — the test `'header close button is shown
only while docked, and sends closeTab'` asserts on the removed button; delete this test.

Update `web/src/App.test.tsx` — the test `'closing a docked tab via its sidebar header ×
sends closeTab with its server index'` clicks `.sidebar-left .files-close` (the removed
button); repoint it at `.sidebar-left .sidebar-tab-close` (the sidebar strip's own close
button), since that is the actual mechanism this test is meant to exercise.

## Verification

Manual: run the web app, dock the file navigator or notifications tab into a sidebar,
and confirm only one close button (×) appears — in the sidebar strip header — and that
clicking it still closes the tab. Not runnable in this environment — note as unverified
manually.

## Spec updates

- `specs/file-tree-tab.md` — the "Header buttons" section claimed the docked header's
  close button was the tree's "only direct close affordance" since "a docked tree has no
  strip × of its own." That's stale: `Sidebar.tsx` already renders its own strip with a
  label and close button for any docked tab. Corrected to describe the header as having
  no close button, with the sidebar strip as the close mechanism.
- `specs/sidebars.md` — added a "The sidebar strip" section documenting the strip's name
  label and close button, which was previously undocumented entirely.
- `specs/notifications.md` — updated the header-buttons paragraph to match: no close
  button in the tab's own header; closed via the sidebar strip.

## Out of scope

- The "shared sidebar tabbed interface" issue (`notifications and file navigator tabs
  should be able to share a sidebar using a tabbed interface`) — unrelated, no
  dependency either direction.
- Any other metadata-line content or styling issues in `work/issues.md`.
- The dock-cycle button or `Sidebar.tsx`'s own close button — both untouched.
