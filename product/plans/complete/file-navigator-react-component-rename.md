# Rename file-tree React components/hooks/utils to file-navigator

**Complexity: 6/10** — a wide, mechanical rename across 25 files and their two external consumers, bounded by a single well-isolated subtree (one public entry point, no CSS coupling) but requiring care to leave wire-protocol names untouched.

## Goal

The product already calls this feature the "file navigator" everywhere except its own React implementation: component files, hooks, and utility modules under `web/src/` still carry the old "FileTree"/"file-tree" naming. Rename them to "FileNavigator"/"file-navigator" to match.

## Background

A prior technical-debt item asking for a full "file tree" → "file navigator" rename across backend code, wire-protocol types, ~20 web components, CSS, ~15 spec files, help.md, CHANGELOG.md, and public documentation was deferred as too complex (9/10). The CSS and documentation pieces were already split out and resolved separately (both far below threshold). This item is the remaining "react components" piece.

Investigation found the rename is well-isolated:
- `FileTreeTab` is the only public entry point, imported by exactly two other components: `Sidebar.tsx` and `ViewTabBody.tsx` (plus `ViewTabBody.test.tsx`).
- Every hook and util module (`useFileTreeDrag`, `useFileTreeRename`, `useFileTreeSearch`, `useFileTreeOpener`, `useFileTreeDelete`, `file-tree-keys`, `file-tree-new-file`, `file-tree-drag`, `file-tree-rename`, `file-tree-row-class`, `file-tree-chords`, `file-tree-actions`) is a leaf with exactly one real consumer: `FileTreeTab.tsx` itself (or its own colocated test).
- CSS is already decoupled — `web/src/theme.css` classes are named `.files-*`, not `.file-tree-*`, and needed no changes (handled by a prior item).
- Six other files reference the old name only in **comments**, not code: `App.tsx`, `CommandInput.tsx` (×2), `DeleteFileDialog.tsx`, `NotificationsTab.tsx`, `SchedulesTab.tsx`, `schedules-keys.ts`.

The real risk, and the reason this isn't a lower complexity: several names that look like "file tree" naming are actually **wire-protocol identifiers owned by the backend**, out of scope for a components-only rename, and must be left untouched:
- The types `FileTreeRow`, `FileTreeView`, and `FileOpenerChoice` are imported `from '@shared/protocol'` (resolving to `src/types.ts`/`src/protocol.ts`) in 17 of the 25 files. These are genuine wire types — renaming them reaches into backend code covered by the still-deferred item, so they stay as `FileTreeRow`/`FileTreeView` everywhere they're used.
- The RPC method-name string literals sent over the websocket — `'fileTreeToggle'`, `'fileTreeReroot'`, `'fileTreeSearch'`, `'fileTreeOpeners'`, `'fileTreeCollapseAll'` (in `FileTreeTab.tsx`, `FileTreeHeader.tsx`, `useFileTreeSearch.ts`, `useFileTreeOpener.ts`, and asserted against in `FileTreeTab.test.tsx`) — are matched by the backend message handler on those exact strings. They stay unchanged; the frontend component/hook names simply call these same RPC methods under a new local name.
- `data-doc-shot="file-tree-view"` in `FileTreeTab.tsx` is a docs-screenshot hook string tied to `scripts/docs-screenshots/manifest.mjs`, which is out of the allowed file scope for this task (`scripts/` isn't in the allowed edit set). Left unchanged.
- `product/specs/file-tree-tab.md` and cross-references to it: a pure internal rename with no user-visible behavior change doesn't require a spec update (specs describe behavior, not implementation), so the spec file and its filename stay as they are.

## Approach

1. `git mv` each of the 25 file-tree-named files under `web/src/` to its file-navigator equivalent.
2. Within each renamed file, rename its own exported component/hook/type/function identifiers (e.g. `FileTreeTab` → `FileNavigatorTab`) and update its intra-module comments, **except** the excluded protocol type names and RPC method strings above.
3. Update every import path and identifier usage across the codebase that references a renamed file or symbol — the two external consumers (`Sidebar.tsx`, `ViewTabBody.tsx`) and all 25 files' own cross-imports of each other.
4. Update the six comment-only files to say "file navigator" / `FileNavigatorTab` instead of "file tree" / `FileTreeTab`.
5. Update test files: renamed imports, renamed `describe`/`it` labels that name the old identifiers, but leave assertions on RPC method-name strings (`'fileTreeToggle'`, etc.) untouched since those strings themselves don't change.

## Implementation

### File renames (`git mv`)

| Old | New |
|---|---|
| `FileTreeTab.tsx` | `FileNavigatorTab.tsx` |
| `FileTreeTab.test.tsx` | `FileNavigatorTab.test.tsx` |
| `FileTreeHeader.tsx` | `FileNavigatorHeader.tsx` |
| `FileTreeRowView.tsx` | `FileNavigatorRowView.tsx` |
| `FileTreeGithubButton.tsx` | `FileNavigatorGithubButton.tsx` |
| `FileTreeGithubButton.test.tsx` | `FileNavigatorGithubButton.test.tsx` |
| `FileTreeOpenerOverlay.tsx` | `FileNavigatorOpenerOverlay.tsx` |
| `useFileTreeDrag.ts` | `useFileNavigatorDrag.ts` |
| `useFileTreeDrag.test.ts` | `useFileNavigatorDrag.test.ts` |
| `useFileTreeRename.ts` | `useFileNavigatorRename.ts` |
| `useFileTreeSearch.ts` | `useFileNavigatorSearch.ts` |
| `useFileTreeOpener.ts` | `useFileNavigatorOpener.ts` |
| `useFileTreeDelete.ts` | `useFileNavigatorDelete.ts` |
| `file-tree-keys.ts` | `file-navigator-keys.ts` |
| `file-tree-keys.test.ts` | `file-navigator-keys.test.ts` |
| `file-tree-new-file.ts` | `file-navigator-new-file.ts` |
| `file-tree-new-file.test.ts` | `file-navigator-new-file.test.ts` |
| `file-tree-drag.ts` | `file-navigator-drag.ts` |
| `file-tree-drag.test.ts` | `file-navigator-drag.test.ts` |
| `file-tree-rename.ts` | `file-navigator-rename.ts` |
| `file-tree-rename.test.ts` | `file-navigator-rename.test.ts` |
| `file-tree-row-class.ts` | `file-navigator-row-class.ts` |
| `file-tree-row-class.test.ts` | `file-navigator-row-class.test.ts` |
| `file-tree-chords.ts` | `file-navigator-chords.ts` |
| `file-tree-actions.ts` | `file-navigator-actions.ts` |

### Identifier renames (exact, word-bounded — never a substring match against `FileTreeRow`/`FileTreeView`)

`FileTreeTab` → `FileNavigatorTab`, `FileTreeHeader` → `FileNavigatorHeader`, `FileTreeRowView` → `FileNavigatorRowView`, `FileTreeGithubButton` → `FileNavigatorGithubButton`, `FileTreeOpenerOverlay` → `FileNavigatorOpenerOverlay`, `useFileTreeDrag` → `useFileNavigatorDrag`, `useFileTreeRename` → `useFileNavigatorRename`, `useFileTreeSearch` → `useFileNavigatorSearch`, `useFileTreeOpener` → `useFileNavigatorOpener`, `useFileTreeDelete` → `useFileNavigatorDelete`, `FileTreeKeyOutcome` → `FileNavigatorKeyOutcome`, `handleFileTreeKey` → `handleFileNavigatorKey`, `fileTreeRowClass` → `fileNavigatorRowClass`, `runFileTreeAction` → `runFileNavigatorAction`.

### Files touched beyond the 25 renamed ones

- `web/src/Sidebar.tsx` — import path + `FileTreeTab` → `FileNavigatorTab` (usage and comment).
- `web/src/ViewTabBody.tsx` — same.
- `web/src/ViewTabBody.test.tsx` — test label mentioning `FileTreeTab`.
- `web/src/App.tsx`, `web/src/CommandInput.tsx`, `web/src/DeleteFileDialog.tsx`, `web/src/NotificationsTab.tsx`, `web/src/SchedulesTab.tsx`, `web/src/schedules-keys.ts` — comment wording only.

### Explicitly unchanged

- `FileTreeRow`, `FileTreeView`, `FileOpenerChoice` type imports from `@shared/protocol` (backend wire types).
- RPC method-name strings: `'fileTreeToggle'`, `'fileTreeReroot'`, `'fileTreeSearch'`, `'fileTreeOpeners'`, `'fileTreeCollapseAll'`.
- `data-doc-shot="file-tree-view"` in `FileNavigatorTab.tsx`.
- `product/specs/file-tree-tab.md` and its filename/cross-references.

## Tests

No new tests — this is a pure rename with no behavior change. Existing tests are renamed and updated in place (imports, `describe`/`it` labels naming the old identifiers) and must continue to pass unchanged in substance:

- `FileNavigatorTab.test.tsx` (was `FileTreeTab.test.tsx`)
- `FileNavigatorGithubButton.test.tsx`
- `useFileNavigatorDrag.test.ts`
- `file-navigator-keys.test.ts`
- `file-navigator-new-file.test.ts`
- `file-navigator-drag.test.ts`
- `file-navigator-rename.test.ts`
- `file-navigator-row-class.test.ts`
- `ViewTabBody.test.tsx` (label update only)

## Out of scope

- Backend `src/file-tree/` module, `protocol.ts`, and the message handler (the still-deferred item).
- The RPC method-name strings and the `FileTreeRow`/`FileTreeView`/`FileOpenerChoice` protocol types.
- `scripts/docs-screenshots/manifest.mjs` and the `/screenshots/file-tree*.png` assets.
- `product/specs/file-tree-tab.md` and other spec files.
- `help.md` and `documentation/user-documentation/` (already correct, or out of scope per prior items).
