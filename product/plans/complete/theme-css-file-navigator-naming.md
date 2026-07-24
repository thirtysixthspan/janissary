# Update theme.css comments to say "file navigator" instead of "file tree"

**Complexity: 1/10** — two comment-line edits in a single CSS file; no selectors, no behavior change.

## Goal

`web/src/theme.css` has two comments naming the feature "file tree." The actual CSS selectors already use the generic `.files-*` naming (`.files-tab`, `.files-rows`, `.files-name`, etc.) — they never literally said "file-tree" — so nothing needs renaming there. Only the prose in the comments needs to catch up to the "file navigator" name already used elsewhere (docs site, recent plan filenames, and even a nearby comment in this same file at line 763 which already says "file-navigator").

## Background

A prior technical-debt item asking for a full "file tree" → "file navigator" rename across backend code, wire-protocol types, ~20 web components, CSS, ~15 spec files, help.md, CHANGELOG.md, and public documentation was deferred as too complex (9/10). A narrower documentation-only piece of that work was already resolved separately. This item is the CSS-only piece.

Checked scope: `web/src/theme.css` is the only CSS file in the project (no CSS modules, no per-component stylesheets). Searching it for "file-tree"/"FileTree"/"filetree" turns up exactly two comments (lines 699 and 750), both describing the file-tree/navigator tab's styles — no selector names contain the old term.

## Approach

Reword the two comments to say "file navigator" instead of "file tree," matching the phrasing of the neighboring comment at line 763 ("the equivalent file-navigator containment").

## Implementation

1. **`web/src/theme.css:699`** — `/* File tree tab: metadata header (image-tab classes) above a scrollable, keyboard-navigable tree. */` → `/* File navigator tab: metadata header (image-tab classes) above a scrollable, keyboard-navigable tree. */`
2. **`web/src/theme.css:750`** — `/* Inline file-tree rename input: matches the row's font and fills the same space .files-name does,` → `/* Inline file-navigator rename input: matches the row's font and fills the same space .files-name does,`

## Tests

None — comment-only change, no selectors or behavior affected.

## Out of scope

- Renaming any `.files-*` selector (none contain "file-tree" literally).
- `web/src/FileTreeTab.tsx` and its `data-doc-shot="file-tree-view"` attribute, or any other `.tsx`/`.ts` file names/identifiers.
- `scripts/docs-screenshots/manifest.mjs` and the `/screenshots/file-tree*.png` assets.
- Spec files, help.md, or documentation (already handled or out of scope per the deferred item's complexity note).
