# File patch 5: apply Add, Update, and Delete sections to the tree view

**Complexity: 7/10** — 22 requirements and 28 test scenarios from the overwrite, link, dangling-target, and change-list rules drive it, with ~190 added lines across three new files and 1 file edited (p=6.54)

Run order: 5 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on `./product/plans/ready/file-patch-1-patch-section-parser.md` and `./product/plans/ready/file-patch-2-hunk-parser.md` (fully parsed `PatchSection` values in `src/file-patch/parse.ts`), `./product/plans/ready/file-patch-3-hunk-applier.md` (`applyHunks` and `ApplyHunksResult` in `src/file-patch/hunks.ts`), and `./product/plans/ready/file-patch-4-tree-view-entries.md` (`createPatchView` and `PatchView` in `src/file-patch/view.ts`, `PatchPlace` and `PatchContent` in `src/file-patch/view-entry.ts`). None of those files exists in the repo yet; all four subplans must land first. This subplan depends on no later one.

This subplan applies a parsed patch's Add, Update, and Delete sections, in order, to the in-memory view. It reports either the net result per path or the first failing section. Nothing is written to disk here (the view only reads), which is what makes "every check runs before anything is written" true. Moves (`*** Move to:`) come in subplan 6. Until then an Update carrying a Move-to target is applied as a plain Update and its target is ignored, which no caller can reach yet.

## Goal

`applySections(view, sections)` in a new `src/file-patch/sections.ts` walks the sections in order against a `PatchView` the caller built (subplan 8 builds it with `createPatchView(root)`). It returns either the ordered changes a commit needs and the rows a success report needs, or the first section that failed.

## Design decisions

From the source plan:

- **Order.** Sections apply in order, and a later section sees what earlier ones produced. The same path may appear in several sections: two Updates apply one after the other, and an Update then a Delete removes the file. The first failing section wins and nothing after it is checked.
- **Add.** The section's `+` lines become the file's content, joined with LF and ending with a final newline. An Add with no lines produces an empty, zero-byte file. Adding a path that exists in the view fails with `File already exists`, unless an earlier section of the same patch deleted that path (subplan 6 adds "or moved it away"). That's how a patch overwrites a file, and there is no overwrite flag. An Add gets default permissions and no BOM.
- **Delete.** Deleting a path that does not exist in the view fails with `File not found`. For a link, the place is removed and the target's content is untouched (subplan 4's two maps).
- **Update.** Updating a path that does not exist in the view fails with `File not found`. Otherwise its hunks go through `applyHunks` on the content entry's current text (BOM already stripped by the view), and a mismatch fails with the hunk's quoted line (subplan 8 prints `No matching text for hunk starting "<line>"`). An Update through a link changes the content entry of the link's `realPath`, which is how write and edit write through an in-root link today. An Update keeps the file's permission bits (subplan 7, through `atomicWriteFile`).
- **Text checks on results.** Any resulting text that contains NUL or an unpaired surrogate is refused with `Not a text file`, and text over 5 MB once encoded (BOM included when the file keeps one) is refused with `File too large (>5 MB)`. These are the checks `encodeToolText` in `src/file-write/filesystem.ts` makes, with the same reasons.
- **Path failures.** A path that `PatchView.resolve` refuses fails the section with that reason, unchanged (`Outside the workspace`, `Protected file`, `Is a directory`, `Not a text file`, `File too large (>5 MB)`, `Secret file`, or the exact ENOTDIR string `Filesystem error ENOTDIR; check the item and destination, then try again`). Mapping a reason for display is subplan 8's job.
- **Failure identity.** A failure names the 1-based section number and its marker text, `Add File: <path>`, `Delete File: <path>`, or `Update File: <path>`, with the path as typed.

Decided here:

- **Check order inside one section.** Resolve the section's path, run the dangling-link check (below), check existence, apply hunks (Update only), then run the text checks on the result (Add and Update). The first failure in that order wins. A section changes the view only after all its checks pass.
- **Section number and marker.** The section number is the section's 1-based index in the `sections` array, not its marker's line. The marker uses the section's own `path` field as the parser returned it, which may differ from the path the place was first typed with. Neither is escaped here; subplan 8 escapes with `displayPath`.
- **Existence.** "Exists in the view" is only the place's exists-now flag (subplan 4, "Existence lives on the place"). An Add sets it to true, which is all it takes to make `PatchView.plannedFolders()` include the place's missing folders. A Delete sets it to false.
- **Add text.** Non-empty `lines` give `lines.join('\n') + '\n'`. Empty `lines` give the empty string. The text goes on the place's content entry as its current text.
- **Delete-then-Add of a regular file.** The Add reuses the place and its content entry, so a link elsewhere in the patch that shows that content sees the new text, as it would on disk. The content write it leads to carries no BOM even when the original had one.
- **Delete-then-Add of a link.** A Delete of a link removes the link, so a later Add of the same path makes a regular file there, not a write through to the old target. The Add clears the place's link text and points the place at a fresh `PatchContent` that `sections.ts` builds itself: its real path is the place's `location`, with no original bytes, no mode, no BOM, and the Add's text. The old target's content entry is untouched. That fresh entry isn't in `PatchView.contents()`, which nothing in subplans 5 to 8 relies on for writes.
- **Path under a deleted file.** Resolution runs against disk (subplan 4), so a Delete of `a` followed by an Add of `a/b.txt` still fails with the ENOTDIR string. A patch can't turn a file into a folder.
- **BOM on a content write.** A content write keeps the original's BOM unless an Add gave that content entry its current text, in which case it has none. An Update after that Add still has none. `PatchContent`'s BOM flag is read-only (subplan 4), so `sections.ts` tracks "text came from an Add" itself, per content entry.
- **How the text checks run.** Export `encodeToolText` from `src/file-write/filesystem.ts` unchanged and call it on the result text, with U+FEFF prepended when the write will keep a BOM. That counts the BOM's three bytes toward the cap, as `file edit` does today (its `decodeEditableText` keeps the BOM in the text whose size `replaceExactText` checks). Only its failure reason is used; the encoded buffer is dropped, and subplan 7 encodes again at write time.
- **A link whose target the patch deleted.** `file write` and `file edit` on a dangling link fail today with `Not a text file`: `resolveMutationTarget` reaches `followSymlink` in `src/file-write/target.ts`, whose `canonicalPath` call throws on a missing target. So once a section deletes a link's target by the target's own name, the link place still exists in the view but stands over removed content, and the view treats it as dangling: any later Add, Update, or Delete of that link place fails with `Not a text file`. An Add hits this check before the existence check, so it gets `Not a text file` rather than `File already exists`, as `file write` would. The check is "the place has link text, its exists-now flag is true, and `PatchView.places()` holds a place whose `location` equals the place's `content.realPath` with exists-now false". It no longer applies once a later Add recreates the target by name (the place at the target's location exists again), and it doesn't apply to a link place a Delete already removed (so Delete-then-Add of the link still works). This rule makes a patch refuse what the same steps run one by one as `file write` and `file edit` would refuse, and it means a content entry whose target was deleted is never written back.
- **Net change rows.** On success the function also returns one row per place, in the order of `PatchView.places()`, comparing the place's state before the patch (its existed-on-disk flag) with its state now (its exists-now flag): `A` (absent before, present now), `M` (present before and now), and `D` (present before, absent now). A place absent before and after gets no row. An `M` row is listed even when the final text equals the original. Each row carries the path as typed at the place's first appearance. Rows are per place, so a patch that names both a link and its target gives two rows, one for each typed path.
- **The result value.** `applySections` returns `{ ok: true, changes, rows }` or `{ ok: false, section, marker, ... }`. A failure carries exactly one of `reason` (a finished reason string from the view, the existence checks, the dangling-link check, or the text checks) or `hunkLine` (the unescaped quoted line from a failed `ApplyHunksResult`). Subplan 8 builds `No matching text for hunk starting "<line>"` from `hunkLine`, as subplan 3's result shape intends.
- **What `changes` carries.** `changes` is the ordered list subplan 7 commits, derived once after the last section from the view's final state and what `sections.ts` recorded while applying. It has three parts (subplan 6 adds moves as a fourth):
  - `folders`: `PatchView.plannedFolders()` at the end, absolute and shallowest first.
  - `deletes`: one entry per place that existed on disk and that a Delete section removed at least once, in `places()` order. Each entry records the place, and its link text and `content` reference as they were when its first Delete ran, because a later Add of the same path may clear the link text and swap the content. A Delete-then-Add place therefore gets both a delete and a content write, so the re-added file gets default permissions as an Add should. A place the patch added and then deleted gets no delete.
  - `writes`: one entry per content entry that a section gave text and that isn't removed at the end, in the order a section first gave each one text. A content entry is removed when `places()` holds a place at its `realPath` whose exists-now flag is false. So an Update of `t` then a Delete of `t` writes nothing, while an Update through link `l` then a Delete of `l` still writes `t`'s new text. Each entry carries the content entry (its `realPath` is where subplan 7 writes, and its original bytes and mode are what a restore needs), the final text, the BOM flag decided above, and the place of the first section that gave it text, whose typed path subplan 7 reports if that write throws. A write is listed even when the final text equals the original, matching the `M` row.

## API

Named here so subplans 6 to 8 can rely on it. Every relative import uses the `.js` extension, and there are no re-exports (the `export … from` ban in `eslint.config.mjs`), so callers import each type from the file that defines it.

- `src/file-patch/sections.ts`: `applySections(view: PatchView, sections: readonly PatchSection[]): ApplySectionsResult` and the exported `ApplySectionsResult` union described above.
- `src/file-patch/changes.ts`: the exported `PatchChanges` type (`folders`, `deletes`, `writes`), its entry types, the type of the record `sections.ts` keeps while applying (places removed by a Delete with their snapshot, content entries given text with their first place and their "from an Add" flag), and one function that builds `PatchChanges` from the view and that record. `sections.ts` imports from `changes.ts`, never the reverse, so `import-x/no-cycle` stays clean.
- `src/file-patch/rows.ts`: the exported `PatchRow` type (its letter, `'A'`, `'M'`, or `'D'`, and the typed path) and one function that builds the rows from `PatchView.places()`. It needs nothing from the record. Subplan 6 adds `R` rows here.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Sections | `PatchSection` in `src/file-patch/parse.ts` (subplans 1 and 2) | Input. `'add'` carries `path` and `lines`, `'delete'` carries `path`, `'update'` carries `path`, an optional `moveTo` (ignored here), and `hunks`. |
| Hunk applier | `applyHunks` and `ApplyHunksResult` in `src/file-patch/hunks.ts` (subplan 3) | Update hunks. `{ ok: false, line }` becomes the failure's `hunkLine`. |
| View | `PatchView` in `src/file-patch/view.ts`; `PatchPlace`, `PatchContent` in `src/file-patch/view-entry.ts` (subplan 4) | Path resolution, existence, link text, current text, original bytes and mode, planned folders. Writes only the fields subplan 4 marks mutable: a place's exists-now flag, link text, and `content` reference, and a content entry's current text. |
| Text checks | `encodeToolText` in `src/file-write/filesystem.ts` | Same three checks and reasons. It's private today. Export it rather than copying it, and keep its behavior unchanged. |
| Size constant | `FILE_POLICY_MAX_BYTES` in `src/file-read/policy.ts` | The 5 MB cap, applied inside `encodeToolText`. Only the tests import it, to size their fixtures. |
| Dangling-link precedent | `followSymlink` in `src/file-write/target.ts` | Why a link over removed content is `Not a text file`. Not called here; the view-level check stands in for it. |
| Temp-dir fixtures | `src/file-write/target.test.ts` (`mkdtempSync` under `tmpdir()` wrapped in `realpathSync`, `writeAt`) | Test setup pattern. |

## Proposed changes

- New `src/file-patch/sections.ts` with `applySections` and one private function per section kind, plus the dangling-link check and the text check. Each function stays under the cognitive-complexity limit of 15.
- New `src/file-patch/changes.ts` with the change-list types and their derivation, so subplan 6 can add moves without pushing `sections.ts` toward 200 lines.
- New `src/file-patch/rows.ts` with the net-row computation, for the same reason.
- `src/file-write/filesystem.ts`: export `encodeToolText`, unchanged. That's its only edit.

The new files each stay well under 200 lines. Everything can land in one change; nothing else in the repo imports these files yet.

## Tests

New `src/file-patch/sections.test.ts` (vitest `server` project) with temp-dir fixtures set up as `src/file-write/target.test.ts` does. Sections are built with `parsePatchText` (subplans 1 and 2) through a small helper that fails the test when the parse fails, so the cases read as patch text. Cover:

- Add of a nested path, an Update, and a Delete, each with its row, and the matching `changes`: the nested Add's folders, shallowest first, a write for the Add and the Update, and a delete for the Delete.
- Delete-then-Add of one path gives `M`, a delete, and a write. Add-then-Delete gives no row, no write, no delete, and no folders. Two Updates of one path apply in order and give one write. Update then Delete gives `D`, a delete, and no write.
- Add on an existing path fails `File already exists`. Update and Delete of a missing path fail `File not found`.
- A hunk mismatch reports the section number, the `Update File:` marker, and the quoted line as `hunkLine`.
- A failing third section reports section 3 even though sections 1 and 2 succeeded in the view, and the disk is untouched (the fixture's files are byte-identical afterward and no new folder exists).
- A result with NUL, with an unpaired surrogate, and over 5 MB each fail with their reason. A BOM file whose text is just under the cap without the BOM and over it with the BOM fails `File too large (>5 MB)` after an Update.
- An outside-root path and a `.git` path fail with their reasons. A Delete of `a` followed by an Add of `a/b.txt` fails with the ENOTDIR string.
- An Update through an in-root link changes the target's content entry, and a following Update of the target by name sees that change. A Delete of a link leaves its target's content alone and writes nothing for it.
- Delete-then-Add of a link gives a delete carrying the original link text and a write at the link's own location, and the target's content is unchanged.
- A Delete of a link's target by name followed by an Update, a Delete, or an Add of the link fails `Not a text file`. With an Add of the target by name in between, the Update of the link succeeds.
- A BOM file's Update keeps the BOM flag on its write. Delete-then-Add of a BOM file writes without one.
- An empty Add yields a zero-length final text, and a non-empty Add ends in exactly one `\n`.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing reaches this from the app until subplan 14.

## Out of scope

- `*** Move to:` semantics and `R` rows (subplan 6).
- Writing to disk and restoring (subplan 7).
- Output text, reason mapping, and escaping (subplan 8).
- An overwrite flag (source plan, Out of scope).
