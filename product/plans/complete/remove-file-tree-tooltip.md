# Remove hover tooltip from file tree rows

**Complexity: 1/10** — remove a single `title` attribute from the row `<div>` in `FileTreeTab.tsx`.

## Goal

Remove the browser-native tooltip that appears when hovering over a file tree row, showing the full file path.

## Background

Each file tree row has `title={row.path}` which renders a browser tooltip on hover. This is redundant: the metadata header already shows the full directory path, and the row's `files-name` span shows the filename. The tooltip adds visual noise without useful information.

## Approach

Delete `title={row.path}` from the row `<div>` in `FileTreeTab.tsx`.

## Implementation

1. **`web/src/FileTreeTab.tsx`** — remove `title={row.path}` (line ~113).
2. No test or spec changes needed.

## Tests

No new tests. No behavior change — this is a cosmetic removal.

## Out of scope

- Any other tooltips in the application.
