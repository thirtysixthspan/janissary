# Match the monitor section resize divider to the sidebar's style

**Complexity: 1/10** — pure CSS rule alignment in `web/src/theme.css`.

## Goal

The drag divider for the reporting section (which hosts the Monitor tab, among other
report-only tabs) currently looks and behaves differently from the sidebar's drag
divider: it is a different thickness and it highlights on hover, while the sidebar's
divider does neither. The two should share one consistent visual treatment.

## Background (verified)

- `web/src/theme.css:447-451`:
  ```css
  .reporting-resize {
    height: 5px; flex-shrink: 0; cursor: row-resize;
    border-top: 1px solid var(--border);
  }
  .reporting-resize:hover { background: var(--accent); }
  ```
- `web/src/theme.css:458-460`:
  ```css
  .sidebar-resize { width: 4px; flex-shrink: 0; cursor: col-resize; }
  .sidebar-left .sidebar-resize { border-right: 1px solid var(--border); }
  .sidebar-right .sidebar-resize { border-left: 1px solid var(--border); }
  ```
- Both dividers are plain, unstyled `<div onMouseDown={...}>` elements in JSX
  (`web/src/ReportingSection.tsx:55`, `web/src/Sidebar.tsx:38`) — all visual styling
  comes from `theme.css`, so this is a CSS-only change.
- Differences found: (1) thickness — 5px vs 4px; (2) `.reporting-resize` has a
  `:hover` highlight, `.sidebar-resize` has none. The border treatment (1px solid
  `var(--border)`, positioned on the inner edge) is already consistent between the two,
  accounting for axis (row vs column resize).

## Approach

Bring `.reporting-resize` in line with `.sidebar-resize`: same 4px thickness, and drop
the hover highlight so neither divider highlights on hover. The `cursor` and
`border-top` properties stay, since those are required for the row-resize affordance
and are already consistent in kind (thickness/color) with the sidebar's border.

## Implementation

1. **`web/src/theme.css:447-451`** — change
   ```css
   .reporting-resize {
     height: 5px; flex-shrink: 0; cursor: row-resize;
     border-top: 1px solid var(--border);
   }
   .reporting-resize:hover { background: var(--accent); }
   ```
   to
   ```css
   .reporting-resize {
     height: 4px; flex-shrink: 0; cursor: row-resize;
     border-top: 1px solid var(--border);
   }
   ```

## Tests

No new automated tests — this is a pure CSS visual-styling fix with no behavioral or
DOM-structure change. Existing drag-resize behavior (`ReportingSection.tsx` divider
mouse handlers) is untouched by this change.

## Verification

Manual: run the web app, hover and drag the divider between the tab strip and the
reporting section (where the Monitor tab lives), and visually confirm it is now the
same thickness as the sidebar's divider and no longer highlights on hover, matching the
sidebar divider's look. Not runnable in this environment — note as unverified manually.

## Out of scope

- Any focus/keyboard-driven resizing.
- The sidebar divider itself (already the reference style — untouched).
- Any other tab/metadata-line styling issues in `work/issues.md`.
