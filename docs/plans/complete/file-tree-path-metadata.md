# Show full directory path in file tree header using metadata display

**Complexity: 2/10** — JSX and CSS change in `FileTreeTab.tsx` and `theme.css`. Mirrors the image tab's metadata pattern.

## Goal

Replace the single bold basename in the file tree header with a metadata-style layout showing both the directory basename (bold) and the full path (smaller, muted, wrappable), matching the image tab's `image-meta` display pattern.

## Background

The file tree tab's header currently shows only `basename(files.root)` (e.g., "project") in a `<span className="files-root">`. The image tab shows a richer metadata line with `image-name` (bold filename), `image-size`, and `image-loc` (full path). The fix brings the file tree header in line with that pattern so the user always sees the full directory path.

## Approach

1. Replace the `<span className="files-root">{basename(files.root)}</span>` with a flex container `<div className="files-meta">` holding two spans: one for the basename (bold, kept as `files-root`) and one for the full path (styled as `files-loc`, matching image-loc).
2. Add CSS for `.files-meta` and `.files-loc` to theme.css.
3. No test changes needed (the header is not tested directly — the rendering test checks for `files-root` class presence).
4. Update the spec to reflect the new display.

## Implementation

1. **`web/src/FileTreeTab.tsx`** — in the header, wrap the root display:
   ```tsx
   <div className="files-meta">
     <span className="files-root">{basename(files.root)}</span>
     <span className="files-loc">{files.root}</span>
   </div>
   ```

2. **`web/src/theme.css`** — add styles after `.files-root`:
   ```css
   .files-meta {
     display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px;
     flex: 1; min-width: 0;
   }
   .files-loc {
     font-size: 12px; word-break: break-all; color: var(--muted);
   }
   ```

3. **`spec/file-tree-tab.md`** — update the description of the tab strip name to mention the header shows the full path.

## Tests

No new tests needed. The existing `'renders rows with indentation...'` test checks for `files-root` presence, which still works. The path display change is cosmetic.

## Out of scope

- Any other file tree tab issues.
- Changing the tab strip name (stays `files`).
- Server-side changes.
