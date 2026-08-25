# Gather the file-navigator feature into `web/src/file-navigator/`

**Complexity: 6/10** — wide but mechanical. Forty-eight files move, every relative import inside them that points at a non-navigator module gains one `../` level, and four files outside the set gain one path segment. No logic changes, no new modules, no renames, and nothing a user can observe changes.

Forty-eight files sharing the `FileNavigator*` / `file-navigator-*` / `useFileNavigator*` naming prefix sit loose in the flat `web/src/` root alongside every other feature's files. The prefix is the feature directory the tree does not have, which is exactly the scatter §1 of [`react-code-organization.md`](../../ai/guidelines/react-code-organization.md) (organize by feature, not by file type) exists to prevent.

The cost is that nothing marks where the feature starts or ends: "does anything outside the navigator use this?" is unanswerable without a grep, the `web/src/` root is unscannable at two-hundred-plus entries, and each new navigator file makes the next reorganization more expensive.

## Goal

`web/src/file-navigator/` holds the feature — its components, hooks, pure modules, and colocated tests. The `web/src/` root drops from 271 entries to 223, and the feature's boundary is visible in the tree instead of in a naming convention.

## Design decisions

**Move only; no renames.** Dropping the `file-navigator-` prefix from files now inside a `file-navigator/` directory is tempting and is the natural follow-up, but it changes forty-eight filenames *and* their import specifiers in the same commit as the move, doubling the review surface for no additional structural gain. The move is what makes the feature legible; the prefix trim can be its own change against a tree where the boundary already exists.

**No interior subdirectories.** §1 says to add interior structure when the file count makes a directory hard to scan, not before, and `web/src/editor/` — the existing feature directory, at 45 flat files plus one `highlight/` subdirectory — is the precedent this repo already set. Forty-eight flat files match it.

**No `index.ts` barrel.** §4 and [`imports-and-barrel-files.md`](../../ai/guidelines/imports-and-barrel-files.md): the four outside callers import the defining module directly, exactly as they do today, with one extra path segment.

**Nothing about the module graph changes.** This plan does not resolve the navigator's remaining outward dependencies (`ContextMenu`, `DeleteFileDialog`, `FileSearchPopup`, `FileOpenerPicker`, `InlineEditInput`, `MoveConflictDialog/`, `SplitTabButton`, `rel-path`, `icons`, `dock-cycle`, `ws`, `CommandInput`, `EditorTab`, `useSelectionAction`) — those become `../` imports and stay as they are. Which of them are genuinely shared and which are cross-feature imports needing §3 treatment is a question the directory makes *askable*; answering it here would bury the move.

**`file-navigator-tab-types.ts` keeps its `EditorTab` and `CommandInput` type imports.** They are drop-handle types the navigator hands to the drag hook. Type-only cross-feature imports are still cross-feature imports, but resolving them means designing a shared drop-target contract — a design change, out of scope for a move.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The precedent feature directory | `web/src/editor/` (45 flat files, one interior `highlight/`) |
| The full set to move | the 48 files matching `FileNavigator*` / `file-navigator-*` / `useFileNavigator*` / `use-file-navigator-*` in `web/src/` |
| The only four outside importers | `App.tsx:31`, `App.test.tsx:8` (selection registry); `Sidebar.tsx:4`, `ViewTabBody.tsx:4` (`FileNavigatorTab`) |
| The `@shared/*` alias, unaffected by depth | `web/tsconfig.json:13` |

## Implementation steps

1. **Create the directory and move all forty-eight files** with `git mv`, so the rename is recorded rather than shown as delete+add. The set is every `web/src/` entry matching `FileNavigator*`, `file-navigator-*`, `useFileNavigator*`, or `use-file-navigator-*`, tests included.

2. **Rewrite imports inside the moved files.** For each moved file, every relative specifier `'./X'` where `X` is *not* itself in the moved set becomes `'../X'`. Specifiers pointing at another moved file stay `'./X'` unchanged. The outward targets are: `ws`, `icons`, `rel-path`, `dock-cycle`, `ContextMenu`, `InlineEditInput`, `SplitTabButton`, `FileOpenerPicker`, `FileSearchPopup`, `DeleteFileDialog`, `MoveConflictDialog/MoveConflictDialog`, `CommandInput`, `EditorTab`, `Sidebar`, `useSelectionAction`.

3. **Rewrite the four outside importers.** `App.tsx` and `App.test.tsx`: `'./file-navigator-selection-registry'` → `'./file-navigator/file-navigator-selection-registry'`. `Sidebar.tsx` and `ViewTabBody.tsx`: `'./FileNavigatorTab'` → `'./file-navigator/FileNavigatorTab'`.

4. **Verify no navigator specifier survives at the old depth** — a repo-wide grep for `from './FileNavigator`, `from './file-navigator-`, `from './useFileNavigator`, and `from './use-file-navigator-` outside the new directory must return nothing.

## Tests

No new tests: this is a move, and the check that it worked is that the feature's existing suites pass unchanged at their new paths.

- The 20 colocated navigator test files move with their subjects and must pass **unchanged** apart from their own import-path rewrites: `FileNavigatorTab.test.tsx`, `FileNavigatorOverlays.test.tsx`, `FileNavigatorGithubButton.test.tsx`, `useFileNavigatorDrag.test.ts`, `useFileNavigatorPaste.test.ts`, `useFileNavigatorSelection.test.ts`, `useFileNavigatorMoveOperations.test.ts`, and the `file-navigator-*.test.ts` pure-module suites (chords, clipboard, detail, drag, keys, menu-items, new-file, relative-path, rename, row-class, siblings).
- `web/src/App.test.tsx` must pass unchanged beyond its one rewritten import — it asserts the app registers `collectNavigatorSelections`, which is the check that the registry is still reachable from the app boundary.
- `web/src/Sidebar.test.tsx` and `web/src/ViewTabBody.test.tsx` must pass unchanged — they render `FileNavigatorTab` through its new path.
- `npm run typecheck:diff` is the real gate for a move of this shape: a missed `../` is a resolution error, not a behavior bug.

## Out of scope

- **Trimming the `file-navigator-` / `FileNavigator` prefixes** from the moved filenames. The natural follow-up, deliberately a separate change (see Design decisions).
- **Resolving the navigator's outward imports** into shared modules or app-shell coordination per §3 — including the `EditorTab`/`CommandInput` drop-handle types. Design work the directory makes visible; not part of the move.
- **Interior subdirectories** (`components/`, `hooks/`) inside the new feature directory. §1 forbids them as scaffolding.
- **An `index.ts` barrel** publishing the feature's entry points. §4 forbids it.
- **`import/no-restricted-paths` lint zones** enforcing the boundary this move creates. Repo-wide config, worth doing, not this fix.
- **Any change to the file navigator's behavior**, its wire protocol, or its server side.
