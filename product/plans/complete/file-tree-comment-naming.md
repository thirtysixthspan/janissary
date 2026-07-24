# Rename "file tree" to "file navigator" in remaining comments

**Complexity: 2/10** — mechanical prose edits inside existing comments across ~15 files; no identifiers, selectors, or behavior change.

## Goal

A series of prior PRs (#613–#619) renamed the file-tree feature to "file navigator" across backend modules, React components, the wire protocol's identifiers, CSS, help.md, and public documentation. Those PRs deliberately left plain-English comments untouched when the comment didn't need to change for the identifier rename to compile. This item is the leftover: comments (and two still-live spec files) that still describe the feature in prose as "file tree" instead of "file navigator."

## Background

Searching `src/`, `web/src/`, and `product/specs/` for "file tree"/"file-tree" (excluding identifiers, file names, and paths, which were already renamed) turns up 26 comment/prose lines across 17 files. Everything else that matches the phrase is out of scope:

- `product/plans/complete/*.md` and `product/plans/deferred/*.md` — historical/frozen documents, never rewritten.
- `CHANGELOG.md` — describes past PRs by their contemporaneous names.
- Test `it(...)` description strings (`src/commands/files.test.ts:47`, `web/src/App.test.tsx:334`, `web/src/useFileNavigatorDrag.test.ts:234`) — string literals, not comments.
- `data-doc-shot="file-tree-view"` (`web/src/FileNavigatorTab.tsx:158`) and the `/screenshots/file-tree*.png` paths it feeds — a docs-tooling identifier/asset name, not a comment.
- `documentation/user-documentation/tab-types/file-navigator.md` — its prose already says "file navigator"; only image paths mention "file-tree", which are asset names, not comments.

## Approach

Edit each comment in place, rewording "file tree" → "file navigator" (or "file-tree" → "file-navigator" where hyphenated) so the sentence still reads naturally. One comment in `web/src/file-navigator-keys.ts` also references a spec file by its old name (`spec/file-tree-tab.md`); since that spec was renamed to `product/specs/file-navigator-tab.md` in a later PR (#619) than the one that left this comment, update the reference to match.

## Implementation

### `src/`

1. `src/types.ts:120` — "row in a file tree tab" → "row in a file navigator tab"
2. `src/types.ts:136` — "A file tree view" → "A file navigator view"
3. `src/protocol.ts:82` — "for a file tree," → "for a file navigator,"
4. `src/protocol.ts:100` — "File-tree payload" → "File-navigator payload"
5. `src/protocol.ts:207,210,212,214,218,221,226,229,238,243` — each "file tree tab" → "file navigator tab" (210/212 have no "tab" suffix in the exact phrase — reword as "a file navigator tab" consistently); 243's "(file tree or notifications)" → "(file navigator or notifications)"
6. `src/notifications-tab.ts:5` — "mirrors the file tree" → "mirrors the file navigator"
7. `src/controller.ts:178` — "(file tree or notifications)" → "(file navigator or notifications)"
8. `src/file-navigator/manager.ts:50` — "Owns file tree tabs" → "Owns file navigator tabs"
9. `src/file-navigator/search.ts:13` — "as the file tree's own sync walk" → "as the file navigator's own sync walk"
10. `src/file-navigator/search.ts:39` — "applying the file tree's own default excludes" → "applying the file navigator's own default excludes"
11. `src/tab/index.ts:59` — "A file tree view tab" → "A file navigator view tab"
12. `src/tab/index.ts:69` — "the file tree tab" → "the file navigator tab"
13. `src/controller/file-navigator.ts:1` — "wrappers for file tree tab RPCs" → "wrappers for file navigator tab RPCs"
14. `src/commands/files.ts:3` — "opens a file tree tab" → "opens a file navigator tab"

### `web/src/`

15. `web/src/useFileNavigatorSearch.ts:5` — "one file tree tab's Search-files" → "one file navigator tab's Search-files"
16. `web/src/useFileNavigatorDrag.ts:16` — "move a file tree row" → "move a file navigator row"
17. `web/src/useFileNavigatorDrag.ts:47` — "a docked file tree tab" → "a docked file navigator tab"
18. `web/src/dock-cycle.ts:1` — "(file tree and notifications)" → "(file navigator and notifications)"
19. `web/src/file-navigator-chords.ts:10` — "The file tree's own Ctrl/Cmd chords" → "The file navigator's own Ctrl/Cmd chords"
20. `web/src/file-navigator-keys.ts:3` — "keydown on the file tree" → "keydown on the file navigator"
21. `web/src/file-navigator-keys.ts:52` — "see spec/file-tree-tab.md" → "see spec/file-navigator-tab.md"
22. `web/src/file-navigator-new-file.ts:11` — "computed from the file tree's selected row" → "computed from the file navigator's selected row"
23. `web/src/FileNavigatorRowView.tsx:21` — "One row of the file tree" → "One row of the file navigator"
24. `web/src/file-navigator-rename.ts:1` — "the file tree's in-place rename field" → "the file navigator's in-place rename field"
25. `web/src/useFileNavigatorRename.ts:8` — "rename for a file tree row" → "rename for a file navigator row"

### `product/specs/`

26. `product/specs/keyboard-navigation.md:43` — "ahead of that file-tree capture" → "ahead of that file-navigator capture"
27. `product/specs/profiles.md:40` — "one or more file-tree tabs" → "one or more file-navigator tabs"

## Tests

None — comment/prose-only change, no behavior affected. `./scripts/run.mjs check-diff` must still pass (lint, typecheck, and the affected test files unchanged in substance).

## Out of scope

- `product/plans/complete/*.md`, `product/plans/deferred/*.md`, `CHANGELOG.md` — historical documents.
- Test description strings in `src/commands/files.test.ts`, `web/src/App.test.tsx`, `web/src/useFileNavigatorDrag.test.ts`.
- `data-doc-shot="file-tree-view"` and `/screenshots/file-tree*.png` — docs-tooling identifiers/assets, not comments.
- `help.md` and `documentation/user-documentation/` — already correct or not describing changed behavior (no behavior changes here at all).
