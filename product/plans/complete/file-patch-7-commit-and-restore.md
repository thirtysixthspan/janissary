# File patch 7: commit the view to disk, with restore on failure

**Complexity: 6/10** — 18 requirements and 22 test scenarios from the four-phase step order, per-kind undo records, and reported-path rules drive it, with ~170 added lines across three new files and no existing files edited (p=5.99)

Run order: 7 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-4-tree-view-entries.md` (`PatchPlace` and `PatchContent` in `src/file-patch/view-entry.ts`: original bytes, mode, link text, typed path), `./product/plans/ready/file-patch-5-add-update-delete-sections.md` (`PatchChanges` and its `folders`, `deletes`, and `writes` entries in `src/file-patch/changes.ts`, and `encodeToolText` exported from `src/file-write/filesystem.ts`), and `./product/plans/ready/file-patch-6-move-sections.md` (`PatchChanges.moves` as rename steps, the write entry's optional final place, and intermediate hop folders). None of those files exists in the repo yet; subplans 1 to 6 must all land first. This subplan depends on no later one.

This subplan writes a fully validated patch to disk. If a disk operation fails partway, it puts back what it already changed and says whether that worked. Nothing in production calls it yet; subplan 8's `applyPatchText` is its first caller.

## Goal

`commitChanges(changes)` in a new `src/file-patch/commit.ts` (the source plan's `commitView`, renamed because it takes the `PatchChanges` that subplans 5 and 6 derive from the view, not the view itself) carries out the change list that `applySections` produced and returns success, or which of the two "failed while applying" outcomes happened, with the reason and the path.

## Design decisions

From the source plan:

- **Operations.** The commit creates the planned folders, unlinks deleted places, carries out each rename step with `renameSync` (`node:fs`) of its from-place's `location` to its to-place's `location`, and writes each changed file with `atomicWriteFile` (`src/atomic-write.ts`). When a moved file's hunks changed it, its content is written after the rename, at the moved place.
- **Permissions.** `atomicWriteFile` keeps an existing file's permission bits (`existingMode` reads them from the file at the write target), which is why an Update keeps them. `renameSync` keeps a moved file's bits and keeps a link a link, so a Move renames the link. A relative link's text is not rewritten, as with `mv`. An Add gets default permissions, because nothing exists at its write target when it is written. There is no mode marker.
- **Delete removes the link, never its target.** A deleted place is unlinked at its own `location`, not at its content's `realPath`.
- **BOM.** A content write puts back the leading U+FEFF when the write entry's BOM flag (subplan 5) says so. An added file has none, because subplan 5 clears that flag for text that came from an Add.
- **Restore.** On any thrown error the commit undoes its completed steps in reverse order: renames are renamed back, created files are removed, and overwritten or deleted files get their original bytes back via `atomicWriteFile`. Then it removes the folders it created, deepest first, each only if it's empty. No backup files are written to disk at any point; original bytes come from the view's content entries, already in memory.
- **Outcome.** When the restore succeeds, the outcome is "nothing changed" with the reason and path of the first failure. When the restore itself throws, the outcome is "some files may have been changed" with the same original reason and path, and nothing is listed. Subplan 8 turns these into `Patch failed while applying: <reason>: <path>. No files were changed.` and `Patch failed while applying: <reason>: <path>. Some files may have been changed.`
- **Emptied folders stay.** A folder left empty by a Delete or a Move stays in place. The patch only touches files, and only folders the patch itself created are removed, and only by a restore. This includes the folders of an intermediate hop (subplan 6): they are created, stay after a successful commit, and are removed only by a restore.
- **Synchronous.** Every step and every undo uses sync `node:fs` calls only, as `writeToolTextFile` does, so no other server work (another session's patch, an editor save) interleaves. `commitChanges` is a plain function, not `async`. Outside processes aren't guarded against. The ceiling is that a patch touching many large files blocks the event loop for its whole run. The upgrade path, if that shows up as lag, is moving `applyPatchText` into a worker behind the same `FileSystemPort.applyPatch` contract (subplan 12). That stays a note, not work.

Decided here:

- **Step order.** Four phases, each walking its `PatchChanges` list in the order subplans 5 and 6 give it:
  1. Folders: `mkdirSync` of each entry of `changes.folders`, non-recursive, in list order (shallowest first). The list already includes every rename step's missing to-place folders (subplan 6), so every rename and write lands in an existing folder.
  2. Deletes: `unlinkSync` of each `changes.deletes` entry's place `location`, in list order. Subplan 6 already leaves out the origin of every chain that produces rename steps, so the commit never unlinks a file it is about to rename.
  3. Renames: `renameSync(from.location, to.location)` for each `changes.moves` step, in list order. That is section order, one step per hop, so an exchange through a third path (`a -> t`, `b -> a`, `t -> b`) replays exactly as the sections ran. The commit does not collapse, reorder, or skip steps.
  4. Writes: one `atomicWriteFile` per `changes.writes` entry, in list order (first-appearance order, subplan 5).
  Deletes run before renames so a Delete-then-Move onto the same path unlinks the old file first, and the rename never has to replace an existing file. A to-place that existed on disk is always either a delete entry or an earlier step's from-place, because subplan 6 refuses a Move onto a path that exists in the view. Deletes and renames run before writes so a write always lands on the file the sections ended with: a Delete-then-Add of a path is unlinked and then written fresh (default permissions, as an Add should get), and a Move then an Add of the old path is renamed away and then the new file is written at the old path.
- **Write target.** A write entry that carries subplan 6's optional final place writes to that place's `location`; every other entry writes to its content entry's `realPath`. So a moved regular file's new text goes to where the rename put it, and keeps the bits the rename kept. A moved link's chain carries no final place (subplan 6), so its text goes to the link's real target, the same `realPath` an Update through the link writes, and the link stays a link. A regular file that a Delete then an Add replaced before it moved is renamed and then written at its final place, so it keeps the original's bits; that is subplan 6's one accepted difference from running the steps one by one.
- **Write bytes.** The bytes are the entry's final text, with U+FEFF prepended when its BOM flag is set, encoded as UTF-8 with `Buffer.from(text, 'utf8')`. The text checks are not run again; subplan 5 ran `encodeToolText` on exactly this string. A zero-length final text writes a zero-byte file.
- **Undo records.** Each phase pushes one undo record after its step returns, never before, so a step that threw has no record and is not undone. `atomicWriteFile` removes its own temporary file when it throws, so a failed write leaves nothing to undo. The records:
  - A created folder: remove it with `rmdirSync`.
  - A deleted regular file: `atomicWriteFile` of the snapshot content's original bytes at the place's `location`, then `chmodSync` of the snapshot content's recorded mode, since a fresh `atomicWriteFile` would give default bits. The snapshot is the `content` reference subplan 5 recorded at the place's first removal, not the place's current `content`, because a later Add or Move may have swapped it.
  - A deleted link (the delete entry's snapshot link text is present): `symlinkSync(linkText, location)` from the snapshot link text. Nothing is written to the link's target, which the delete never touched.
  - A rename step: `renameSync(to.location, from.location)`.
  - A write whose content entry has original bytes: `atomicWriteFile` of those original bytes at the same write target. This covers an in-place Update, an Update through a link, a Delete-then-Add of a regular file (its content entry is reused, subplan 5), and a moved regular file written at its final place (the rename put the origin's file there, and the following rename undo carries it back).
  - A write whose content entry has no original bytes: `unlinkSync` of the write target. This covers an Add at a new path, a Delete-then-Add of a link and an Add over a path a Move vacated (both use a fresh `PatchContent` with no original bytes, subplans 5 and 6), and a redirected write that is not part of an on-disk rename (an Add then a Move: subplan 6 gives it an entry with no original bytes, so its restore removes the file at the final place).
  Because writes run after deletes and renames, their undos run first. That is what makes a combined path restore cleanly: for a Delete-then-Add of a link the re-added file is removed before `symlinkSync` re-creates the link at the same location, and for a Delete-then-Add of a regular file the original bytes are written back and then the delete's undo re-applies the original mode.
- **Restore walk.** On the first thrown error the commit stops issuing steps and walks the undo records from last to first, each undo in its own `try`. A throwing undo marks the restore failed, and the walk continues with the remaining records, so as much as possible is put back. Created folders are undone like any other record, in that same reverse walk, which removes them deepest first after every file inside them has been undone.
- **A folder that can't be removed.** A created folder's undo that throws `ENOTEMPTY` (or `EEXIST`, which some platforms use for the same case) leaves the folder in place and does not count as a failure, since something else put files there. Any other error from `rmdirSync` counts as a failed restore.
- **The reported path.** The path in the outcome is a path as typed, from the view's place record (`PatchPlace`'s typed path at first appearance, subplan 4), never an absolute path, and unescaped (subplan 8 escapes it with `displayPath`):
  - A delete reports its place.
  - A rename step reports its from-place.
  - A write reports the entry's reported place (subplan 5's "place of the first section that gave it text", which subplan 6 sets to the final place for a redirected write).
  - A folder reports the first place, in step order (rename steps' to-places, then writes' target places), whose `location` is inside that folder. Every planned folder has one, because `plannedFolders()` only plans folders for places that exist now, each of which the change list renames or writes, and subplan 6 adds folders only for rename steps' to-places.
  The reason is `fileOperationReason(error)` (`src/file-navigator/file-operation-result.ts`), the same mapping write and edit use. A failed restore keeps the first failure's reason and path; errors from the restore itself are not reported.
- **The intermediate-hop collision.** An Add at the path of an intermediate hop's folder passes the view (subplan 6, "Folders for intermediate hops") and fails here: the folder phase creates the folder, the renames run through it, and the Add's `atomicWriteFile` fails to rename its temporary file onto the folder. That is an ordinary thrown error: the commit restores (renames back, created folder removed) and returns "nothing changed" with the Add's typed path and the mapped reason. No extra check is added for it.
- **Failure injection.** `commitChanges` takes an optional second argument, a `CommitOperations` object of the sync operations it and its restore call: `mkdir`, `writeFile` (defaults to `atomicWriteFile`), `unlink`, `rename`, `rmdir`, `symlink`, and `chmod`. It defaults to the real `node:fs` calls (`mkdirSync`, `unlinkSync`, `renameSync`, `rmdirSync`, `symlinkSync`, `chmodSync`) and `atomicWriteFile`. Tests pass a wrapper that throws on the Nth call of a chosen operation, because spying on `node:fs` exports under ESM is unreliable. Production callers (subplan 8) pass nothing.
- **The result value.** `commitChanges` returns a `CommitOutcome`: `{ ok: true }`, or `{ ok: false, restored, reason, path }` where `restored` is true for "nothing changed" and false for "some files may have been changed". It never throws for an `fs` error.

## API

Every relative import uses the `.js` extension, and there are no re-exports, so each type is imported from the file that defines it (as in subplans 5 and 6).

- `src/file-patch/commit.ts`: `commitChanges(changes: PatchChanges, operations?: CommitOperations): CommitOutcome`, the exported `CommitOutcome` type, the four phases, and the reported-path rule. It imports `PatchChanges` and its entry and rename-step types from `./changes.js` (or from whichever file subplan 6 put the rename-step type in, if it extracted `changes-moves.ts`), `PatchPlace` and `PatchContent` from `./view-entry.js`, and the restore from `./restore.js`.
- `src/file-patch/restore.ts`: the exported undo-record type (one member per record kind above) and the function that walks a record list backward with a `CommitOperations` and returns whether every undo succeeded.
- `src/file-patch/commit-operations.ts`: the exported `CommitOperations` type and the default object built from `node:fs` and `atomicWriteFile`. Both `commit.ts` and `restore.ts` import it, and it imports neither, so `import-x/no-cycle` stays clean.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How the commit uses it |
| --- | --- | --- |
| Atomic single-file write | `atomicWriteFile` in `src/atomic-write.ts` | Every content write and every restore of original bytes. It keeps the existing file's mode (`existingMode`) and removes its temporary file when it throws. |
| Reason mapping | `fileOperationReason` in `src/file-navigator/file-operation-result.ts` | The reason text for a thrown `fs` error. |
| Change list | `PatchChanges` (`folders`, `deletes`, `writes`, `moves`) in `src/file-patch/changes.ts` (subplans 5 and 6) | Input: the four phases, the delete snapshots, the write entries' BOM flag, final place, and reported place. |
| Original bytes, mode, link text, typed path | `PatchContent` and `PatchPlace` in `src/file-patch/view-entry.ts` (subplan 4) | What the restore puts back, and the path the outcome reports. |
| Sync write precedent | `writeToolTextFile` in `src/file-write/filesystem.ts` | Sync `node:fs` only; `atomicWriteFile` for the write. |
| Temp-dir fixtures | `src/file-write/target.test.ts` (`mkdtempSync` under `tmpdir()` wrapped in `realpathSync`, `writeAt`) | Test setup pattern. |

## Proposed changes

- New `src/file-patch/commit-operations.ts`, `src/file-patch/restore.ts`, and `src/file-patch/commit.ts`, as in the API above. The split is decided up front, so `commit.ts` stays well under 200 lines; keep each phase in its own function and every function under the cognitive-complexity limit of 15.
- No existing file is edited.

Land `commit-operations.ts` and `restore.ts` first, then `commit.ts` and its tests; nothing imports them yet, so every checkpoint stays green.

## Tests

New `src/file-patch/commit.test.ts` (vitest `server` project) with temp-dir fixtures set up as `src/file-write/target.test.ts` does. Build `changes` by running `parsePatchText` (subplans 1 and 2) and `applySections` (subplans 5 and 6) on a `createPatchView(root)`, through a helper that fails the test when either fails, so cases read as patch text and use the real contract. Cover:

- A successful commit of a nested Add (folders created), an Update of a `0o640` file (bits kept, checked with `statSync(...).mode & 0o777`), a Delete, and a Move with hunks of a `0o640` file (new place holds the new text with `0o640`, old place gone).
- A Delete of a link removes the link and leaves its target. A Move of a link leaves a link at the new place with the same link text (`readlinkSync`). An Update through a link changes the target and keeps the link.
- A BOM file keeps its BOM after an Update and after a Move with hunks. A Delete-then-Add of a BOM file is written without one.
- A Delete-then-Add of a regular file gets default permissions, and a Delete-then-Add of a link leaves a regular file at the link's location and the old target unchanged.
- A Move then an Add of the old path leaves the moved file at the new path and the added file at the old path. A Delete then a Move onto that path leaves the moved file there.
- An exchange `a -> t`, `b -> a`, `t -> b` swaps the contents of `a` and `b`, and `t` doesn't exist afterward.
- A chain `a -> x/b -> c` leaves the file at `c`, and the intermediate folder `x` remains, empty.
- Emptied folders remain after a Delete and after a Move.
- An injected failure on the last write restores every earlier write, rename, and delete byte for byte, re-creates a deleted link with its original link text, re-applies a deleted regular file's mode, removes a re-added file before re-creating the link at the same location, removes the folders the commit created, and returns `restored: true` with the failing write's typed path and reason.
- An injected failure on a rename step, after a delete and before any write, restores the delete and earlier renames and reports the from-place's typed path. An injected failure on a later `mkdir` removes the earlier created folder and reports the place under the failing folder.
- An Add at the path of an intermediate hop's folder (`a -> x/b`, `x/b -> c`, then Add `x`) fails at commit with no injection, restores `a`, removes `x`, and returns `restored: true` with the Add's typed path.
- An injected failure inside the restore itself returns `restored: false` with the original failure's reason and path, and the restore still runs the remaining undos (an earlier write is still put back).
- A created folder that something else filled before the restore (the test's wrapper writes a file into it before throwing) is left in place and the outcome is still `restored: true`.
- No `.tmp` files are left beside any target after any of the failures above.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing reaches the commit from the app until subplan 14.

## Out of scope

- Removing folders a patch emptied, including intermediate hop folders after a successful commit (source plan, Out of scope).
- Guarding against outside processes, and on-disk backups that survive a crash (source plan, Out of scope).
- Running the patch in a worker. It's the documented upgrade path only.
- Building `PatchChanges` (subplans 5 and 6) and turning the outcome into output text (subplan 8).
