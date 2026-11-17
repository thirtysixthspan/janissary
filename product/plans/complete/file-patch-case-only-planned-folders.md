# Share one planned folder between case-only spellings on a case-insensitive volume

**Complexity: 4/10** — ~12 added production lines, 2 files, 4 requirements, 4 scenarios, 1 new unit (p=4.35)

## Goal

On a volume that ignores letter case, a patch that creates files beneath differently cased spellings of the same new folder must create that folder once and succeed. Adding `A/b/first` and `a/c/second` in one patch currently plans both `A` and `a`, runs `mkdir` for each, and fails the whole patch with `EEXIST` while applying, leaving every path unchanged. The same failure occurs when a move destination or an intermediate move hop names the folder with the other case. On a volume that distinguishes case, the spellings must remain separate folders exactly as they are today.

## Approach

`createPatchView` already folds the planned-folder counter through `planKey`, which lowercases a folder only when the cached volume decision says the volume ignores case. `derivePlannedFolders` does not use that key: it deduplicates the existing places' `missingFolders` by exact string. Two case-variant spellings of a missing folder therefore both reach `PatchChanges.folders`, and `commitChanges` runs `mkdir` twice, the second failing because the first created the same folder under the other spelling.

The fix reuses the view's cached decision in both places that build the folder list. `derivePlannedFolders` keeps a map from `planKey(folder)` to the first spelling seen, then returns the values in the existing shallowest-first order, so the first spelling is the one created and reported. The view exposes that key as `folderKey` on `PatchViewReads`, letting `buildPatchChanges` merge `view.plannedFolders()` with the move destinations' `missingFolders` through the same key, keeping the first spelling and the existing depth order. A folder from an intermediate move hop then folds with a planned folder of the other case instead of producing a second `mkdir`. When the cached decision says the volume is case-sensitive, `folderKey` returns the folder unchanged, so no distinct folders merge.

## Implementation steps

1. In `src/file-patch/view.ts`, add `folderKey(folder: string): string` to `PatchViewReads`, implement it with the existing `planKey` helper, and return it from `createPatchView`. Change `derivePlannedFolders` to hold a `Map<string, string>` from `planKey(folder)` to the first spelling seen and return its values sorted by the existing depth comparison.
2. In `src/file-patch/changes.ts`, build the folder list from a `Map<string, string>` keyed by `view.folderKey(folder)` while walking `view.plannedFolders()` followed by the moves' `missingFolders`, keep each first-seen spelling, and apply the existing depth sort to the values. Add `folderKey: (folder) => folder` to the two inline `PatchViewReads` fixtures in `src/file-patch/sections.test.ts`.
3. In `src/file-patch/view.test.ts`, add an unguarded case with `createPatchView(root, true)` that adds `A/b/first` and `a/c/second` and asserts the planned list is the first spelling's `A`, `A/b`, and `a/c`. Add an unguarded pinned-sensitive case that adds the same two paths and asserts both `a` and `A` remain planned.
4. In `src/file-patch/apply.test.ts`, add a guarded case on a case-insensitive volume that applies Adds under `A/b/first` and `a/c/second` and expects `Patched 2 files:` with both rows. Add a second guarded case where an Add under `A/b/first` shares the patch with a move whose intermediate hop lands under `a/c`, asserting the patch succeeds and the moved file exists.
5. In `product/specs/acp.md`, extend the file patch section's case-insensitive paragraph to state that differently cased spellings of one missing folder are created once under the first spelling, and that a case-sensitive volume keeps them separate.
6. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- `src/file-patch/view.test.ts`: with the volume decision pinned insensitive, `A/b/first` and `a/c/second` produce one shallowest-first planned list containing `A`, `A/b`, and `a/c`, with the first spelling appearing once.
- `src/file-patch/view.test.ts`: with the volume decision pinned sensitive, the same two adds plan both `a` and `A`, proving the fold does not merge genuinely distinct folders.
- `src/file-patch/apply.test.ts`: guarded on a case-insensitive volume, two Adds under `A/b` and `a/c` report `Patched 2 files:` with both rows and create both files.
- `src/file-patch/apply.test.ts`: guarded on a case-insensitive volume, an Add under `A/b/first` and a move whose intermediate hop lands under `a/c` commit successfully, so the merge with move destinations folds the folder.
- The existing case-only view and apply cases, the planned-folder derivation case, and the commit folder cases must keep passing unchanged.

## Out of scope

- Changing `commitChanges`' folder reporting, restore behavior, or `mkdir` ordering.
- Changing `resolveMutationTarget`, the patch parser, row output, or reason wording.
- Folding folders on a case-sensitive volume, or probing the volume anywhere but the view's existing cached decision.
- Updating `help/file.md`; it documents that missing parent folders are created and does not describe the folder spelling today.
