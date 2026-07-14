# Match monitor header button styles to the file navigator's metadata line

**Complexity: 1/10** — pure CSS rule alignment in `web/src/theme.css`.

## Goal

The monitor tab's header buttons should look consistent with the file navigator tab's header
buttons — both are the same "metadata line with trailing icon buttons" pattern used across tab
types.

## Background (verified)

- `web/src/FileTreeTab.tsx` renders two header buttons, `files-dock-cycle` and
  `files-collapse-all`, both styled by one shared rule in `web/src/theme.css:547-551`:
  ```css
  .files-collapse-all, .files-dock-cycle {
    background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px;
    padding: 0 4px; line-height: 1;
  }
  .files-collapse-all:hover, .files-dock-cycle:hover { color: var(--fg); }
  ```
- `web/src/MonitorTab.tsx` renders two header buttons in its `monitor-actions` div:
  `monitor-snapshot` (☰) and `monitor-reset` (↺). Only `.monitor-reset` has a CSS rule
  (`web/src/theme.css:486-490`), and it already matches the file-navigator buttons exactly
  (same transparent/border/color/cursor/font-size/padding/line-height, and the same `:hover`
  color change).
- **`.monitor-snapshot` has no CSS rule at all** — it renders with the browser's default button
  chrome (background, border, padding), visibly inconsistent with its sibling `.monitor-reset`
  button and with the file navigator's header buttons. This is the actual mismatch the issue
  refers to.
- The header containers themselves (`.monitor-header`/`.monitor-actions` vs.
  `.files-header`/`.files-actions`) already share identical layout rules — no change needed there.

## Approach

Add `.monitor-snapshot` to the existing `.monitor-reset` rule (and its `:hover`), the same way
`.files-collapse-all` and `.files-dock-cycle` already share one rule. No new CSS values are
introduced — `.monitor-snapshot` adopts the exact declarations already proven consistent with the
file navigator.

## Implementation steps

1. **`web/src/theme.css:486-490`** — change:
   ```css
   .monitor-reset {
     background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px;
     padding: 0 4px; line-height: 1;
   }
   .monitor-reset:hover { color: var(--fg); }
   ```
   to:
   ```css
   .monitor-snapshot, .monitor-reset {
     background: transparent; border: none; color: var(--muted); cursor: pointer; font-size: 13px;
     padding: 0 4px; line-height: 1;
   }
   .monitor-snapshot:hover, .monitor-reset:hover { color: var(--fg); }
   ```

## Tests

No new automated tests — this is a pure CSS visual-styling fix with no behavioral or
DOM-structure change (both buttons already exist with their current class names and click
handlers, exercised by `web/src/MonitorTab.test.tsx`'s existing snapshot/reset button tests).

## Verification

- `./scripts/run.mjs check-diff` — lints the changed CSS/file, incrementally typechecks (no `.ts`/
  `.tsx` changes expected), and runs the related web tests (unaffected, confirming no regression).
- Manual: run the web app, open a monitor tab, and visually confirm the ☰ snapshot button now
  matches the ↺ reset button and the file navigator's header buttons (transparent background, no
  border, same muted color and hover treatment). Not runnable in this environment — note as
  unverified manually.

## Out of scope

- The shared header container layout (`.monitor-header`/`.monitor-actions` vs.
  `.files-header`/`.files-actions`) — already consistent, no change needed.
- Any other tab/metadata-line styling issues in `work/issues.md`.
- The monitor suggestion row's own buttons (`.cmd`, rating thumbs) — not part of the header
  metadata line this issue refers to.
