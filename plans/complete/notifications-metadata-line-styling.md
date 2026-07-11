# Style the notifications tab's header like the file tab's metadata line

**Complexity: 2/10** — JSX restructure + new CSS rules, self-contained to the
notifications tab.

## Goal

The notifications tab's dock-cycle and close buttons currently render inside a bare
`<div className="notifications-header">` with **no CSS at all** backing that class or
its button classes — they render with default browser button chrome, unstyled and
misaligned. The file navigator tab's equivalent header (`.files-header`) is a proper
metadata line: a bordered, padded flex row with muted, small text and consistently
styled action buttons. The notifications header should look the same way.

## Background (verified)

- `web/src/NotificationsTab.tsx:24-44` renders the header:
  ```tsx
  {dock && (
    <div className="notifications-header">
      <button type="button" className="notifications-dock-cycle" ...>⇄</button>
      <button type="button" className="notifications-close" ...>×</button>
    </div>
  )}
  ```
- `web/src/theme.css` has **no** rule for `.notifications-header`,
  `.notifications-dock-cycle`, or `.notifications-close` — confirmed by grep, zero
  matches for "notification" anywhere in the file.
- The file tab's equivalent (`web/src/FileTreeTab.tsx:101-136`,
  `web/src/theme.css:522-536`) is the reference pattern:
  ```css
  .files-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 12px; color: var(--muted); font-size: 12px; border-bottom: 1px solid var(--border);
  }
  .files-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .files-collapse-all, .files-dock-cycle, .files-close {
    background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px;
    padding: 0 4px; line-height: 1;
  }
  .files-collapse-all:hover, .files-dock-cycle:hover, .files-close:hover { color: var(--fg); }
  ```
  The file header also has a `.files-meta` div (a location label) on the left, with
  `justify-content: space-between` pushing `.files-actions` to the right. The
  notifications header has no metadata text to show (that's out of scope — a separate
  `work/issues.md` entry covers adding notification content itself), so its buttons
  should simply sit right-aligned within the same bordered/padded row treatment.
- `web/src/NotificationsTab.test.tsx` already covers behavior (button titles, click →
  `send` calls) — this change touches only class names and CSS, not behavior, titles, or
  handlers, so those tests should keep passing unmodified.

## Approach

Wrap the two buttons in a `.notifications-actions` div (mirroring `.files-actions`),
give `.notifications-header` the same box treatment as `.files-header` but
right-aligned (`justify-content: flex-end`, since there is no left-side metadata
content yet), and give the buttons the same visual treatment as
`.files-collapse-all`/`.files-dock-cycle`/`.files-close`.

## Implementation

1. **`web/src/NotificationsTab.tsx`** — wrap the two `<button>` elements in a new
   `<div className="notifications-actions">` inside the existing
   `.notifications-header` div.

2. **`web/src/theme.css`** — add, near `.files-header`/`.files-actions`:
   ```css
   /* Notifications tab: metadata header matching the file tab's header treatment. */
   .notifications-header {
     display: flex; align-items: center; justify-content: flex-end;
     padding: 6px 12px; color: var(--muted); font-size: 12px; border-bottom: 1px solid var(--border);
   }
   .notifications-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
   .notifications-dock-cycle, .notifications-close {
     background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px;
     padding: 0 4px; line-height: 1;
   }
   .notifications-dock-cycle:hover, .notifications-close:hover { color: var(--fg); }
   ```

## Tests

No new automated tests — this is a markup/CSS-only restyle with no behavioral change.
Existing `web/src/NotificationsTab.test.tsx` assertions (button titles present when
docked, click handlers send the right RPCs) already cover the buttons' behavior and are
unaffected by the class/CSS change; they continue to pass as regression coverage.

## Verification

Manual: run the web app, dock the notifications tab into a sidebar, and visually
confirm its header now matches the file navigator's header — bordered, padded,
muted small text, consistently styled buttons — instead of unstyled default buttons.
Not runnable in this environment — note as unverified manually.

## Out of scope

- Adding actual metadata content (persona, counts, etc.) to the notifications header —
  no such content is planned by this issue.
- The "no close button" issue for file/notifications metadata lines (separate
  `work/issues.md` entry).
- Any dock-cycle/close *behavior* changes — only the visual treatment changes.
