# File patch 6: apply `*** Move to:` sections and their `R` rows

**Complexity: 7/10** — 22 requirements and 21 test scenarios from the chain, on-disk, survival, link follow-through, and rename-step rules drive it, with ~250 added lines across three new files and 3 files edited (p=6.79)

Run order: 6 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-1-patch-section-parser.md` and `./product/plans/ready/file-patch-2-hunk-parser.md` (the `'update'` member of `PatchSection` in `src/file-patch/parse.ts`, with its optional `moveTo` and its `hunks`), `./product/plans/ready/file-patch-3-hunk-applier.md` (`applyHunks`), `./product/plans/ready/file-patch-4-tree-view-entries.md` (`PatchView`, `PatchPlace`, `PatchContent`), and `./product/plans/ready/file-patch-5-add-update-delete-sections.md` (`applySections`, `changes.ts`, `rows.ts`). None of those files exists in the repo yet; all five must land first. This subplan depends on no later one.

This subplan adds moves to section application. An Update with `*** Move to: <new>` renames the file (applying its hunks on the way) in the patch's view of the tree, and the success report shows it as one `R <old> -> <new>` row. Nothing touches disk here. Subplan 7 carries a move out with `renameSync`.

## Goal

`applySections` (`src/file-patch/sections.ts`) applies Move-to targets, adds the rename steps a commit needs to its `changes`, and `src/file-patch/rows.ts` produces `R` rows. Subplan 5's interim behavior, applying an Update with a `moveTo` as a plain Update and ignoring the target, goes away.

## Design decisions

From the source plan:

- **Move marker.** An `*** Update File: <old>` line followed directly by `*** Move to: <new>`, optionally followed by hunks, renames the file and applies the hunks in one section without re-sending the file's content. Delete-plus-Add remains a valid way to move.
- **Source and target rules.** The source must exist in the view (`File not found` otherwise). The target goes through `PatchView.resolve`, so it's subject to the same path rules as `file write` (`resolveMutationTarget`): an outside-root target fails with `Outside the workspace`, a `.git` or `.janissary` target with `Protected file`, and every other reason subplan 4 lists (`Is a directory`, `Not a text file`, `File too large (>5 MB)`, `Secret file`, the ENOTDIR string) the same way. The target follows the Add rule: `File already exists` unless an earlier section of the same patch deleted or moved away that path.
- **Overwrite by an earlier move.** The Add rule in subplan 5 also gains "or moved it away": a path an earlier Move vacated can be added again.
- **Failure identity.** A failure in a Move section, including one caused by its target, names the section's `Update File: <old>` marker (the section's own `path` field, as subplan 5 builds markers) and its 1-based section number. A hunk mismatch carries `hunkLine`, as for an Update.
- **Links.** A Move renames the link itself, not its target (subplan 7 does it with `renameSync`). The target place takes the moved place's link-ness, so a later Update of the new path writes through to the link's real target.
- **Row.** A Move prints `R <old> -> <new>`, both paths as typed.

Decided here:

- **Where move state lives.** `PatchView` (subplan 4) is not changed and gains no move field. Moves are recorded in the record `sections.ts` already keeps while applying (subplan 5's record type in `changes.ts`), as a list of move chains defined in a new `src/file-patch/move-chains.ts`. On the view, a Move writes only the fields subplan 4 marks mutable: exists-now flags, link text, and `content` references.
- **What a Move does to the view.** After its checks pass, the target place takes the source place's link text (absent when the source is a regular file) and its `content` reference, and its exists-now flag becomes true, which is all `PatchView.plannedFolders()` needs to plan the target's missing folders. The source place's exists-now flag becomes false, its link text is cleared, and it is pointed at a fresh `PatchContent` that `sections.ts` builds: real path equal to the place's `location`, no original bytes, no mode, no BOM, and no current text, the same shape subplan 5 builds for Delete-then-Add of a link. So a later Add of the source path writes a new file there and never touches the moved text. The fresh entry isn't in `PatchView.contents()`, as in subplan 5.
- **"Or moved it away" needs no extra rule.** Because a Move clears the source's exists-now flag, subplan 5's existence check ("exists in the view" is only that flag) already lets a later Add, or a later Move onto that path, succeed.
- **Check order inside a Move section.** Resolve the source, run subplan 5's dangling-link check on it, check it exists, apply the hunks (when there are any) to its content entry's current text, resolve the target, run the dangling-link check on the target, check the target doesn't exist in the view, then run subplan 5's text checks on the resulting text, with U+FEFF counted when the moved content will keep a BOM. The first failure wins, and the view changes only after every check passes. The target gets the dangling-link check before its existence check because it follows the Add rule, so a target that is a live link over removed content gets `Not a text file`, as an Add of it would.
- **Link follow-through after a move.** On disk a link shows whatever is now at its target's path. So each time `sections.ts` or the Move handler gets a link place from `resolve`, before the dangling-link check, it looks in `PatchView.places()` for a place whose `location` equals the link place's `content.realPath`. When that place exists now and shows a different content entry, the link place is pointed at that entry. This covers a link to a file a Move took away and an Add put back (the link sees the new file) and a link to a path a Move filled (the link sees the moved file). When that place doesn't exist now, nothing is re-pointed and subplan 5's dangling-link check refuses the link with `Not a text file`, as `file write` would refuse a dangling link. Without moves this never fires, because the entry is always the same one.
- **A Move onto its own place.** A target that resolves to the source's own place (another spelling of the same path, or on a case-insensitive volume a case-only rename, since subplan 4 gives both spellings one place) exists in the view, so it fails `File already exists`.
- **A target known only to the view.** Resolution runs against disk (subplan 4), so a link whose target exists only because an earlier section added or moved it there still resolves as dangling and is refused, and a path under a file a Move took away still fails with the ENOTDIR string. A patch can't turn a file into a folder by moving it.
- **Chains.** The record holds one chain per moving file. A Move whose source place is some chain's current place extends that chain: its current place becomes the target, and the hop is appended. Any other Move starts a new chain with the source as origin. Each chain keeps its origin place, its current place, its travelling content entry (the source's `content` at the start), whether it moves a link (the source had link text at the start), whether it is an on-disk move (below, decided at the start), and its hops in section order, each a from-place and a to-place. A Move `a -> b` then `b -> c` is one chain from `a` to `c`.
- **On-disk move.** A chain is an on-disk move when, at its start, its origin existed on disk, no earlier Move vacated the origin, and, for an origin that was a link on disk, the origin still has its link text (a Delete-then-Add of a link replaced the link with a new regular file). Only on-disk moves rename anything on disk. A chain that moves a file the patch itself created (an Add, or a re-added path an earlier Move vacated) is only a content write at its final place. A regular file that a Delete then an Add replaced before it moved is still an on-disk move: the original file is renamed and the Add's text written over it, so it keeps the original's permission bits instead of getting defaults. That's the one accepted difference from running the steps one by one.
- **A surviving chain.** A chain survives when, at the end, its current place exists now and shows its travelling entry, and, for a link chain, still has link text. A Move then a Delete of the new path doesn't survive, and neither does a link moved, deleted, and added again. A regular file moved, deleted, and added again at the same new path does survive, since subplan 5's Delete-then-Add of a regular file reuses the place's content entry; it gives an `R` row and a rename followed by the Add's text.
- **When a chain shows as `R`.** A chain produces one `R <origin> -> <final>` row when it is an on-disk move that survives, its origin place doesn't exist now, and its final place didn't exist on disk. Otherwise each place gets its normal net row from subplan 5. So a Move then a Delete of the new path prints `D <old>`. A Move from `a` to `b` and back prints `M a`. A Move onto a path an earlier section deleted prints `D <old>` and `M <new>`. A Move then an Add of the old path prints `M <old>` and `A <new>`. An Add then a Move prints `A <new>`. The `R` row takes the origin's first-appearance position in `PatchView.places()`, and the final place's row is dropped. The two paths are each place's path as typed at its first appearance, as subplan 5's rows use.
- **Rename steps, not collapsed moves.** `changes` gains `moves`: one rename step per hop of every chain that is an on-disk move and survives, in section order, each with its from-place, its to-place, and whether the chain moves a link. Steps are replayed in section order rather than collapsed to origin and final, because collapsed moves run in any fixed order break a patch that exchanges two paths through a third (`a -> t`, `b -> a`, `t -> b`); replaying hops in section order is always what the sections did. A chain that doesn't survive, or isn't an on-disk move, contributes no steps.
- **Folders for intermediate hops.** `changes.folders` becomes `PatchView.plannedFolders()` plus the missing folders of every rename step's to-place, each folder once, ordered by depth (fewest path segments first) with ties in the order `plannedFolders()` gives, then step order. An intermediate hop's folders are created and stay after the commit, as emptied folders stay. A later Add of a file at the path of such an intermediate folder passes the view (the folder isn't planned) and fails at commit, where subplan 7 restores. That's accepted as rare.
- **Deletes.** Subplan 5's `deletes` also gains every place that existed on disk and that a Move vacated, with its link text and `content` reference snapshotted at its first removal by either a Delete or a Move. `deletes` never lists the origin of a chain that produces rename steps; its file leaves by the rename. So a Move then a Delete of the new path deletes the old path, and a Move then an Add of the old path renames and then writes the new file.
- **Writes.** For a regular-file chain whose current place isn't its origin, the travelling entry is written only when the chain's current place exists now and shows it. Its write entry gains an optional field naming that place, and the entry's reported place (subplan 5's "place of the first section that gave it text") is that place too. Subplan 7 writes to that place's `location` instead of the entry's `realPath`. Every other content entry keeps subplan 5's rule, with one added clause: it is also not written when the place at its `realPath` exists now but shows a different entry, which is the case for the content of a path that was deleted and then had another file moved onto it. A link chain's travelling entry is the link target's content, so it keeps writing to its `realPath` with no extra field. A Move with hunks counts as giving its travelling entry text. A Move without hunks doesn't, so a plain rename produces no write. The BOM decision for a moved entry is the entry's own (subplan 5): it moves with the entry.

## API

Every relative import uses the `.js` extension and there are no re-exports, as in subplan 5.

- `src/file-patch/move-chains.ts` (new): the exported `MoveChain` type and its hop type, the function that records a Move on the chain list (extend or start), and the predicates for "on-disk move", "survives", and "shows as `R`". It imports only types from `./view-entry.js`. `changes.ts`, `rows.ts`, and `moves.ts` import from it; it imports none of them, so `import-x/no-cycle` stays clean.
- `src/file-patch/moves.ts` (new): the Move-section handler `sections.ts` calls for an `'update'` section with a `moveTo`, returning the same failure shape subplan 5's handlers return. It runs the check order above and the view changes, and records the chain and the vacated place.
- `src/file-patch/section-steps.ts` (new): subplan 5's dangling-link check and text check, moved out of `sections.ts` unchanged, plus the link follow-through step and the fresh-`PatchContent` builder subplan 5 uses for Delete-then-Add of a link. Both `sections.ts` and `moves.ts` import it, so `moves.ts` never imports `sections.ts`.
- `src/file-patch/changes.ts` (edited): the record gains the chain list and the vacated places; `PatchChanges` gains `moves`; a write entry gains its optional final place; the derivation applies the folders, deletes, and writes rules above.
- `src/file-patch/rows.ts` (edited): `PatchRow` gains an `'R'` member carrying the old path and the new path; the row function takes the chain list as a second argument.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Section application | `applySections` in `src/file-patch/sections.ts` (subplan 5) | Dispatches an Update with `moveTo` to the Move handler. Its per-kind handlers are the model for the Move handler's failure shape. |
| Checks | Dangling-link check and text check in `src/file-patch/sections.ts` (subplan 5), over `encodeToolText` in `src/file-write/filesystem.ts` | Moved to `section-steps.ts` unchanged and run on the source and target. |
| Fresh content | Subplan 5's Delete-then-Add-of-link `PatchContent` builder in `sections.ts` | Moved to `section-steps.ts` and reused for a vacated source. |
| Change list and record | `PatchChanges` and the apply-time record in `src/file-patch/changes.ts` (subplan 5) | Extended with moves, vacated places, and the write's final place. |
| Net rows | `PatchRow` and the row function in `src/file-patch/rows.ts` (subplan 5) | Extended with `R` rows. |
| Hunk applier | `applyHunks` in `src/file-patch/hunks.ts` (subplan 3) | A Move's hunks, exactly as an Update's. |
| View | `PatchView` in `src/file-patch/view.ts`, `PatchPlace` and `PatchContent` in `src/file-patch/view-entry.ts` (subplan 4) | Places, link text, the target's path checks, per-place missing folders, and `plannedFolders()`. |

## Proposed changes

- New `src/file-patch/move-chains.ts`, `src/file-patch/moves.ts`, and `src/file-patch/section-steps.ts`, as in the API above. Each stays well under 200 lines, and each function under the cognitive-complexity limit of 15.
- `src/file-patch/sections.ts`: route `'update'` sections with a `moveTo` to the Move handler, import the moved checks from `./section-steps.js`, and run the link follow-through step on every link place it resolves. Moving the checks out keeps it under 200 lines.
- `src/file-patch/changes.ts`: the record and derivation changes above. If they push it past 200 lines, move the `moves` and `folders` derivation into a new `src/file-patch/changes-moves.ts` that `changes.ts` imports.
- `src/file-patch/rows.ts`: `R` rows and the rule for when a chain shows as one.

Order: the extraction into `section-steps.ts` first (subplan 5's tests stay green), then `move-chains.ts`, then `moves.ts` with the `sections.ts` dispatch, then `changes.ts` and `rows.ts`.

## Tests

Extend `src/file-patch/sections.test.ts` (vitest `server` project, temp-dir fixtures and the parse helper subplan 5 set up):

- A Move with hunks gives one `R <old> -> <new>` row, one rename step, and a write of the moved entry naming the new place. A Move without hunks gives the row and the step and no write. A Move of a BOM file keeps the BOM flag on its write.
- A Move into a missing nested folder plans that folder.
- A Move to an existing path fails `File already exists` on the `Update File:` marker. A Move whose target an earlier section deleted succeeds, with a delete of the target, a rename step, and rows `D <old>` and `M <new>`. An Add onto a path an earlier Move vacated succeeds, with rows `M <old>` and `A <new>`, a rename step, a write at the old path, and no delete. A Move onto its own place fails `File already exists`.
- A Move of a missing source fails `File not found`. A hunk mismatch in a Move reports `hunkLine` on the `Update File:` marker.
- Outside-root and `.git` Move-to targets fail on the `Update File:` marker. A Move of `a` followed by an Add of `a/b.txt` fails with the ENOTDIR string.
- A Move chain `a -> b -> c` collapses to one `R a -> c` row with two rename steps, and no row for `b`. A Move from `a` to `b` then back gives `M a` and no steps. A Move then a Delete of the target gives `D a`, a delete of `a`, and no steps or writes. An Add then a Move gives `A <new>`, a write at the new place, and no steps.
- An exchange `a -> t`, `b -> a`, `t -> b` gives three rename steps in section order, `M a` and `M b`, and no row for `t`.
- A Move of a link keeps the target place a link with the same link text, its chain marked as a link, and a later Update of the new path changes the link's real target, written at that target's `realPath`.
- A link to `a`, then a Move of `a` away, then an Update of the link fails `Not a text file`. With an Add of `a` in between, the Update of the link changes the added file's text and the moved file's entry is untouched.
- After a Delete of `b` and a Move of `a` onto `b`, an Update through a link to `b` changes the moved file's text.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing reaches this from the app until subplan 14.

## Out of scope

- The rename on disk and its restore (subplan 7).
- Output text and escaping of `R` rows (subplan 8).
- Rewriting a relative link's text after a move (source plan: not rewritten, as with `mv`).
- Folding a case-only rename into a rename (it fails `File already exists`, above).
