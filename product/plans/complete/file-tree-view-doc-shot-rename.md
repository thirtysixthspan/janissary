# Rename file-tree-view to file-navigator-view in scripts and user documentation

**Complexity: 2/10** — four coordinated string/filename edits across two small files plus a two-asset rename; no logic change.

## Goal

The last few "file tree" naming holdouts are a `data-doc-shot` hook string, the docs-screenshot manifest entries that reference it, and the two screenshot assets it produces — all still named `file-tree`/`file-tree-view` while the rest of the product (backend, React components, CSS, specs, help.md) already calls this feature the "file navigator." Finish the rename in these remaining spots.

## Background

Prior technical-debt items resolved the backend module, wire-protocol types, React components/hooks, CSS comments, spec files, and help.md (each split out from an original 9/10-rated combined item and resolved separately). Each of those explicitly left the `data-doc-shot="file-tree-view"` attribute in `web/src/FileNavigatorTab.tsx` and `scripts/docs-screenshots/manifest.mjs` untouched, citing `scripts/` as out of scope for those tasks. This item is scoped precisely to close that gap, and its own backlog text explicitly includes `scripts/` and `documentation/user-documentation/`.

Verified this is the complete remaining list (searched all of `src/`, `web/src/`, `product/specs/`, `help.md`, `documentation/`, `scripts/`, CSS): no other live file contains `file-tree`/`FileTree` naming. `product/plans/complete/*.md` and `CHANGELOG.md` are historical records left as-is per established precedent.

## Approach

1. Rename the `data-doc-shot` attribute value in `web/src/FileNavigatorTab.tsx`.
2. Rename the matching manifest entries in `scripts/docs-screenshots/manifest.mjs` (entry `name`s and the `target` selector) so the doc-shot hook keeps matching.
3. Rename the two generated screenshot assets to match (pure filename rename — the visual content doesn't change, so no Playwright/Chromium re-capture is needed).
4. Update the two image references in `documentation/user-documentation/tab-types/file-navigator.md` to the new filenames.

## Implementation

1. **`web/src/FileNavigatorTab.tsx:158`** — `data-doc-shot="file-tree-view"` → `data-doc-shot="file-navigator-view"`.
2. **`scripts/docs-screenshots/manifest.mjs:115`** — `name: 'file-tree'` → `name: 'file-navigator'`.
3. **`scripts/docs-screenshots/manifest.mjs:118`** — `target: 'file-tree-view'` → `target: 'file-navigator-view'`.
4. **`scripts/docs-screenshots/manifest.mjs:122`** — `name: 'file-tree-sidebar'` → `name: 'file-navigator-sidebar'`.
5. `git mv documentation/public/screenshots/file-tree.png documentation/public/screenshots/file-navigator.png`
6. `git mv documentation/public/screenshots/file-tree-sidebar.png documentation/public/screenshots/file-navigator-sidebar.png`
7. **`documentation/user-documentation/tab-types/file-navigator.md:16`** — `/screenshots/file-tree.png` → `/screenshots/file-navigator.png`.
8. **`documentation/user-documentation/tab-types/file-navigator.md:44`** — `/screenshots/file-tree-sidebar.png` → `/screenshots/file-navigator-sidebar.png`.

## Tests

None — a `data-doc-shot` attribute value, a docs-tooling manifest, doc-image paths, and asset filenames have no test coverage, and no user-visible or executable behavior changes (the manifest's `name` field only affects the output image filename, and `target` only needs to keep matching the same attribute value it always pointed at).

## Out of scope

- Any other manifest entry, screenshot, or doc page — only the `file-tree`/`file-tree-view`/`file-tree-sidebar` identifiers named above.
- Regenerating the screenshots via Playwright — the images' visual content is unchanged, only filenames move.
- `CHANGELOG.md` and `product/plans/complete/*.md` — historical records, left as-is per established precedent in prior rename items.
