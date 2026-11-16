# Avoid quadratic planned-folder work when validating a large patch

**Complexity: 4/10** — ~35 added production lines, 3 files, 6 requirements, 7 scenarios (p=5.13)

## Goal

Keep patch validation linear in the number of sections when a patch plans many folders. Resolving each Add, Update, Delete, or Move path must not rebuild or sort the full planned-folder list, and must not scan that list for membership, so a valid patch within the 5 MB argument cap cannot spend time that grows with the square of the section count before it touches disk.

## Approach

`createPatchView` keeps the planned folders in a counting map beside the memoized shallowest-first list. A place claims each of its `missingFolders` exactly once while it exists, so the map holds a folder while at least one existing place wants it and drops it when the last one stops existing. `setExists` is the only way section code changes a place's existence: it applies the change, adds or removes the place's missing folders from the counting map, and invalidates the memoized list.

`checkFolders` tests membership against the counting map instead of rebuilding the list, so every resolve costs a constant-time lookup plus the existing `missingFolders.some(...)` ENOTDIR walk, which is bounded by path depth. `plannedFolders()` still derives the same deduplicated, shallowest-first list from the existing places and rebuilds only on demand after an existence change.

`add` and `remove` in `sections.ts` and both transitions in `moveSection` route through `view.setExists`, so add-then-delete and move-then-add keep the map and the list accurate. The two `checkFolders` rules are unchanged: a resolved location that is a planned folder fails `Is a directory`, and a missing folder whose place exists fails with the ENOTDIR reason.

## Implementation steps

1. In `src/file-patch/view.ts`, add `setExists(place: PatchPlace, value: boolean): void` to `PatchView`. In `createPatchView`, hold a `Map<string, number>` of planned-folder claims and the memoized `plannedFolders()` result; add a `contribute` helper that adds or removes a place's missing folders, and a `setExists` method that ignores an unchanged value, applies the change, updates the claims, and clears the memo. Have `checkFolders` test `planned.has(keys.location)` and keep the ENOTDIR walk. Keep `plannedFolders()` deriving its deduplicated, depth-sorted list from the existing places. Update the interface comment so it says existence changes go through `setExists`.
2. In `src/file-patch/sections.ts`, pass the view into `add` and `remove` and replace their direct `place.exists` writes with `view.setExists(place, true)` and `view.setExists(place, false)` at the same points in the section flow.
3. In `src/file-patch/moves.ts`, replace `target.exists = true` and `source.exists = false` in `moveSection` with the corresponding `view.setExists` calls, leaving the link-text, content, record, and ordering work untouched.
4. In `src/file-patch/view.test.ts`, route the fixture existence writes through `view.setExists` and add the many-resolve rebuild-count case.

## Tests

- `src/file-patch/view.test.ts`: the planned-folder derivation case and the planned file/folder collision case drive existence through `view.setExists` rather than assigning `place.exists`.
- New case in `src/file-patch/view.test.ts`: resolve several hundred Add paths and then mark every one existing while counting calls to the array sort the derivation performs. Assert the sort does not run during those resolves or existence changes, and runs exactly once when `plannedFolders()` is next read. This pins both the per-resolve rebuild and the rebuild-per-Add invalidation.
- New case in `src/file-patch/view.test.ts`: add a place in a missing folder, move it away, and re-add it, with an idempotent repeat while it exists. Assert `Is a directory` while it exists and again after the re-add, and a successful resolve after each removal, so the claim count cannot double or leak.
- The existing planned-folder, ENOTDIR, add-then-delete, move, and commit folder tests must keep passing unchanged.

## Out of scope

- Patch semantics, reason wording, folder creation order, and any user-visible behavior.
- The per-resolve `missingFolders.some(...)` ENOTDIR walk, whose work is bounded by the depth of the path rather than the number of sections.
- Changing `buildPatchChanges`, `commitChanges`, or the shape of `PatchChanges`.
