# Remove basename from file navigator header, show abbreviated full path

## Problem

The file navigator header (FileTreeTab) shows two pieces of metadata: a bold basename and a dimmed full absolute path. The issue asks to remove the basename and show only the abbreviated full path (using `$root`/`~` shortcuts). This is the display counterpart to the `expandUserPath()` feature — paths should be shown short and accepted back in that form.

## Complexity

2/10 — shorten `files.root` server-side in `view()`, drop the basename span client-side.

## Solution

1. **Server**: In `TabManager.view()`, apply `this.shorten()` to `files.root` before sending to the client (same pattern already used for `cwd` in buffer lines).
2. **Client**: Remove the `basename()` helper and `.files-root` span from `FileTreeTab.tsx`. Keep only `.files-loc` showing the (now abbreviated) full path.
3. **CSS**: Remove unused `.files-root` class.

## Changes

### `src/tab-manager.ts`
- In `view()`, apply `this.shorten()` to `t.files.root` when `t.files` is present.

### `web/src/FileTreeTab.tsx`
- Remove the `basename()` helper function.
- Remove the `<span className="files-root">` element.
- Keep only `<span className="files-loc">{files.root}</span>`.

### `web/src/theme.css`
- Remove the `.files-root` CSS rule.

## Tests

- `src/tab-manager.test.ts` (if exists) or `src/controller.test.ts`: verify `files.root` is shortened in the view output.
- `web/src/FileTreeTab.test.tsx`: verify the abbreviated path is shown and no basename is rendered.

## Spec

Update `specs/file-tree-tab.md` to describe the single-line abbreviated path display instead of dirname + full path.

## Out of scope
- No changes to image tab or markdown tab metadata (they follow a different pattern).
- No changes to how files.root is used internally by the file tree manager (it still uses absolute paths).
