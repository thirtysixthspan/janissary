# Contain the notifications tab's scroll within its sidebar, matching the file navigator

**Complexity: 3/10** — CSS-only fix mirroring the existing `.files-tab`/`.files-rows`
containment pattern.

## Goal

When the notifications tab is docked into a sidebar and its transcript grows longer than
the sidebar can render, the whole sidebar (and the app) currently grows taller instead of
scrolling internally. It should behave like the file navigator: overflow is contained to
a scrollbar inside that one tab's content area, with no effect on the rest of the layout.

## Background (verified)

- `web/src/NotificationsTab.tsx:23` renders `<div className="notifications-tab">` — this
  class has **zero** CSS rules anywhere in `web/src/theme.css` (confirmed by grep). It is
  a plain block-level div.
- Its child, `<Transcript>` (`web/src/Transcript.tsx`), renders `.transcript` with
  `web/src/theme.css:238`: `.transcript { flex: 1; overflow-y: auto; padding: 8px 12px; }`.
  Since `.notifications-tab` is not `display: flex`, the `flex: 1` on `.transcript` has no
  effect — `.transcript`'s height is just its content's natural height, so
  `overflow-y: auto` never has anything to actually clip/scroll against. The content
  keeps growing, which grows `.notifications-tab`, `.sidebar-body`, and `.sidebar`.
- Compare to the working file-navigator pattern (`web/src/theme.css:520-537`):
  ```css
  .files-tab { flex: 1; min-height: 0; display: flex; flex-direction: column; outline: none; }
  ...
  .files-rows { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 0 22px; }
  ```
  `.files-tab` is a proper flex column container with `min-height: 0`, so its `.files-rows`
  child's `flex: 1` + `overflow-y: auto` correctly bounds and scrolls the row list without
  growing any ancestor.
- The flex chain above both tabs is otherwise sound: `.app { display: flex; flex-direction: row; height: 100%; }`
  (`theme.css:140`) gives `.sidebar` a stretched, definite height; `.sidebar-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }`
  (`theme.css:456`) is already a column flex container. The missing piece is purely
  `.notifications-tab` itself not being a flex container, plus `.transcript` lacking the
  explicit `min-height: 0` that `.files-rows` has.
- The file navigator additionally hides its own scrollbar while inside a sidebar
  (`theme.css:548-549`: `.sidebar .files-rows { scrollbar-width: none; } .sidebar .files-rows::-webkit-scrollbar { display: none; }`),
  while the content still scrolls via wheel/drag. `Transcript` is used only by
  `NotificationsTab` inside a sidebar (agent tabs' `Transcript` usage in `App.tsx` is
  always centered, never docked), so scoping the same rule to `.sidebar .transcript` is
  safe and precise.

## Approach

Give `.notifications-tab` the same flex-column/`min-height: 0` treatment as `.files-tab`,
add `min-height: 0` to `.transcript` (matching `.files-rows`), and mirror the sidebar
scrollbar-hiding rule for `.transcript` the same way it's done for `.files-rows`.

## Implementation

1. **`web/src/theme.css`** — near `.notifications-header` (added by a prior fix), add:
   ```css
   .notifications-tab { flex: 1; min-height: 0; display: flex; flex-direction: column; }
   ```

2. **`web/src/theme.css:238`** — change
   `.transcript { flex: 1; overflow-y: auto; padding: 8px 12px; }`
   to
   `.transcript { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; }`

3. **`web/src/theme.css`** — near `.sidebar .files-rows` (`theme.css:548-549`), add the
   matching scrollbar-hiding rule for the notifications transcript:
   ```css
   .sidebar .transcript { scrollbar-width: none; }
   .sidebar .transcript::-webkit-scrollbar { display: none; }
   ```

## Tests

No new automated tests — this is a pure CSS containment fix with no DOM structure or
behavioral change, and jsdom (used by `NotificationsTab.test.tsx`/`App.test.tsx`) does
not perform real layout, so it cannot assert on scroll/overflow containment. This
mirrors the precedent in `plans/complete/center-command-dot.md` and
`plans/complete/monitor-resize-divider-style.md` for layout-only CSS fixes.

## Verification

Manual: run the web app, dock the notifications tab into a sidebar, generate enough
notifications to overflow the sidebar's height, and confirm a scrollbar appears within
the notifications tab's own content area while the sidebar and the rest of the app stay
their normal size — matching the file navigator's existing scroll behavior. Not runnable
in this environment — note as unverified manually.

## Out of scope

- Any other notifications-tab issues in `work/issues.md` (ordering/timestamps).
- The file navigator's own scroll behavior — already correct, untouched.
- Centered (non-docked) notifications tab rendering — `.transcript`'s `min-height: 0`
  addition is a no-op there since the centered layout already has enough flex containment
  upstream (`.tab-body`, `.main`) for `overflow-y: auto` to work correctly today.
