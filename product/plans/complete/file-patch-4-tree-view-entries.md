# File patch 4: in-memory tree view and path resolution

**Complexity: 6/10** — 22 requirements and 32 test scenarios from the link, canonical-key, and planned-folder rules drive it, with ~160 added lines and no existing files edited (p=6.23)

Run order: 4 of 15 in the `file patch` series. Source plan: `./product/plans/complete/file-patch.md`. Depends on nothing in the series at runtime, and imports nothing from `parse.ts`, `parse-hunks.ts`, or `hunks.ts`. It comes after subplans 1 to 3 only so the `src/file-patch/` directory and its conventions already exist.

This subplan adds the in-memory view of the files a patch touches. The view resolves every path through the same policy `file write` uses, reads each existing file once, and keeps what a commit and a restore need to know about it. Subplans 5 and 6 apply sections to it, and subplan 7 commits what they derive from it. Nothing in production calls it yet.

## Goal

A new `src/file-patch/view.ts` exports a `PatchView` built for one root. Its job is to answer one question for each requested path: is this path allowed, what is it (an existing file, an existing link to a file, or nothing yet), and what does it hold right now in the patch's view of the tree?

## Design decisions

From the source plan:

- **Path rules.** Every section path, and every `*** Move to:` target, goes through `resolveMutationTarget` (`src/file-write/target.ts`). It already yields `Outside the workspace`, `Protected file` (for `.git` and `.janissary`), `Is a directory`, and `Not a text file`, so a patch refuses exactly what write and edit refuse. It also yields `Secret file` for a secret path (`checkLexicalPath` and `checkRealTarget` in `src/file-read/policy.ts`) and the ENOTDIR reason for a path under a file, which is the exact string `Filesystem error ENOTDIR; check the item and destination, then try again` (`NOT_A_DIRECTORY_REASON` at `src/file-write/target.ts`, built as `fileOperationReason({ code: 'ENOTDIR' })`).
- **Keying.** File contents are keyed by the resolved real path. Two spellings of one file share one entry. See "Canonical keys" below for how that holds on a case-insensitive volume.
- **Read once.** An existing file is read on first touch with `readBoundedRegularFile` (`src/file-write/bounded-read.ts`, which gives `File too large (>5 MB)` above `FILE_POLICY_MAX_BYTES` and `Not a text file` for a non-regular file) and decoded with `decodeEditableText` (`src/file-write/edit-text.ts`, fatal UTF-8 with `ignoreBOM: true`, so non-UTF-8 or NUL content is `Not a text file` and a BOM survives the decode). Its original bytes, BOM included, stay in memory for the restore. No backup file is written.
- **BOM.** A leading U+FEFF is stripped from the decoded text before any hunk sees it and remembered on the content entry, so subplan 7 puts it back on write. Strip it the way `readExistingText` in `src/file-write/filesystem.ts` does (`startsWith('\u{FEFF}')` then `slice(1)`). An added file has none.
- **Existence.** The view answers whether a path exists *in the view*: on disk at first touch, then as earlier sections left it. Subplan 5 turns that into `File not found` and `File already exists`.
- **Links.** `resolveMutationTarget` follows an existing symbolic link to its target (`checkExisting` then `followSymlink` in `src/file-write/target.ts`), so `WriteTarget.realPath` is the target, the right thing for an Update to write through. A link to a file outside the root, to a directory, or into a protected folder is refused there with that reason. The place also keeps its own location (below). A Delete unlinks that location, and a Move renames it. A dangling link as the last segment is refused by `followSymlink` with `Not a text file` (its `canonicalPath` call throws), so a patch can't delete one. A dangling link as a missing ancestor segment (`dangling/x.txt`) is refused by `danglingEntryRefusal`, with the link target's policy reason or `Not a text file`.
- **Folders.** The view records the folders the patch will create: the missing segments of each Add or Move-to target, under its nearest existing ancestor. Subplan 7 creates them and removes them again on a failed restore.

Decided here:

- **Two maps: places and contents.** A link adds a second identity beside the file's contents, so the view keeps two maps. The *content* map is keyed by the content's real path and holds `PatchContent`: the real path, the original bytes and permission mode (absent for a file that didn't exist on disk), whether the original had a BOM, and the current text (absent for a file that didn't exist on disk, until a section gives it text). The *place* map is keyed by the place's own `location` and holds `PatchPlace`: the path as typed at its first appearance (for display), the absolute `location`, the link text from `readlinkSync` when the place is a link (absent otherwise, which is how "is a link" is answered), whether it existed on disk at first touch, whether it exists now in the view, the missing folders its creation needs, and a direct reference to the `PatchContent` it shows. For a regular file or a missing path, `location` and the content's real path are the same string. An Update through a link and an Update of its target by name change the same content entry. A Delete of a link removes only its place, and the target's content is untouched.
- **Existence lives on the place.** "Exists in the view" is answered only by the place's exists-now flag. A content entry's current text is what a write would put there, not an existence flag. At first touch, exists-now equals existed-on-disk, and current text is the decoded, BOM-stripped text for an existing file and absent otherwise.
- **Canonical keys.** For a missing path, both keys are `WriteTarget.realPath` (canonical nearest ancestor joined with the remaining segments). For an existing regular file, both keys are `realpathSync.native(target.realPath)`, because `checkExisting` returns the typed basename unchanged and on a case-insensitive volume `A.txt` and `a.txt` would otherwise be two entries for one file (`realpathSync.native` returns the on-disk case on macOS). For an existing link, the content key is `target.realPath` (already canonical, from `followSymlink`), and the location is the canonical parent folder of `path.resolve(root, requested)` joined with its basename, the same join `resolveBelowRoot` uses for `lexicalDestination` in `src/file-write/target.ts`. Before recording a new link place, the view looks for an existing link place with the same `lstatSync` `dev` and `ino` and returns that one, so case-only spellings of a link share a place too. Two spellings of a missing path that differ only in case are not unified; they stay two places, as two `file write` calls would be two writes.
- **How a link is detected.** For an existing target the view computes the lexical location above and calls `lstatSync` on it. A symbolic link becomes a link place at that location with `readlinkSync` text; anything else is a regular-file place at the canonical real path. `src/file-write/target.ts` is not edited: `WriteTarget` already gives everything except the location, and the location is one `realpathSync.native` of the parent folder.
- **Permissions.** The original mode is `statSync(realPath).mode & 0o777`, the same mask `existingMode` in `src/atomic-write.ts` uses and subplan 7's tests check. It's a separate `statSync` called just before `readBoundedRegularFile`, which is not edited. Both run before any write, since nothing in this subplan writes.
- **Thrown `fs` errors.** The extra `realpathSync.native`, `lstatSync`, `readlinkSync`, `statSync`, and the read all run inside one `runFileOperation` (`src/file-navigator/file-operation-result.ts`), as `editToolTextFile` wraps `readEditableFile` in `src/file-write/edit.ts`. A thrown error becomes its `fileOperationReason`.
- **Missing folders per place.** A place's missing folders are derived from `WriteTarget`: the absolute folders `path.dirname(realPath)`, its parent, and so on, one per entry of `missingSegments`, stored shallowest first. `WriteTarget` doesn't expose the nearest ancestor, and this derivation doesn't need it.
- **Planned folders are derived, not registered.** `resolve` can't know whether its caller is an Add or an Update, and an Update of a missing path must plan nothing. So `plannedFolders()` returns the missing folders of every place whose exists-now flag is true at the time of the call, each folder once, ordered by depth (fewest path segments first) with ties in first-appearance order. A place added and then deleted again plans nothing. Section application needs no extra call to plan folders: setting exists-now is enough.
- **Paths through planned folders.** A path under a folder the view plans passes `resolveMutationTarget` unchanged, since that resolves against disk. The view then checks two things against its current state, on every `resolve` call and before looking up an existing place: when the resolved location is one of `plannedFolders()`, the call fails with `Is a directory`; when one of the target's missing folders is the location of a place whose exists-now flag is true, it fails with the ENOTDIR reason. So the view never plans a file and a folder at one place. A place that exists only on disk is already refused by `resolveMutationTarget` with the same two reasons, so the view's state and the disk agree.
- **Resolution failure is per call.** `resolve` hands back `resolveMutationTarget`'s failure reason, a read or decode reason, or one of the two checks above, unchanged. A failed call records no place and no content entry. Subplans 5 and 6 attach the section number.
- **Lookup order inside `resolve`.** Run `resolveMutationTarget`, compute the keys, run the two planned-folder checks, then return the existing place for that location (or the matching link place by `dev` and `ino`) when there is one. Only a new place is read from disk, and only a new content key creates a content entry; a new place whose content key is already in the map (a link and its target by name) points at the existing entry and reads nothing.
- **Synchronous only.** Every call uses sync `node:fs`, as `writeToolTextFile` does, so no other server work interleaves with a patch.

## API

Named here so subplans 5 to 7 can rely on it:

- `createPatchView(root: string): PatchView`.
- `PatchView.resolve(requested: string): FileOperationResult<PatchPlace>` returns the place for that path or a failure reason. The place's `content` field is its `PatchContent`. The first successful call for a place records it. Later calls for any spelling of the same place return the same object.
- `PatchView.places()` returns the places in order of first appearance, and `PatchView.contents()` returns the content entries in order of first appearance. Both are read-only arrays.
- `PatchView.plannedFolders()` returns the folders to create, as absolute paths, shallowest first, derived as described above.
- Mutable fields, written only by section application (subplans 5 and 6): a place's exists-now flag, its link text, and its `content` reference (subplan 6 moves link-ness and content to a Move's target place), and a content entry's current text. Every other field is `readonly`. A comment at the top of `view.ts` says who may write them.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How the view uses it |
| --- | --- | --- |
| Target resolution and protection | `resolveMutationTarget`, `WriteTarget` in `src/file-write/target.ts` | Every path's policy check, real path, existence on disk, and missing segments. |
| Lexical destination | `lexicalDestination` in `resolveBelowRoot`, `src/file-write/target.ts` | Model for a link place's location (canonical parent plus requested basename). `recheckDestination` joins `basename(target.realPath)`, which for a link is the target's name, so it is not the model. |
| Link refusals | `followSymlink` and `danglingEntryRefusal` in `src/file-write/target.ts`, reached through `resolveMutationTarget` | Already refuse a dangling link (last segment and ancestor segment) and a link escaping the root or naming a directory. |
| ENOTDIR reason | `NOT_A_DIRECTORY_REASON` in `src/file-write/target.ts` (private) | Build the same string with `fileOperationReason({ code: 'ENOTDIR' })` rather than exporting it. |
| Bounded read | `readBoundedRegularFile` in `src/file-write/bounded-read.ts` | One bounded read per file. |
| Strict decode | `decodeEditableText` in `src/file-write/edit-text.ts` | Fatal UTF-8 and NUL refusal. |
| BOM strip | `readExistingText` in `src/file-write/filesystem.ts` | Same `\u{FEFF}` test and slice. |
| Mode mask | `existingMode` in `src/atomic-write.ts` | Same `& 0o777`. |
| Result type | `FileOperationResult`, `failureResult`, `runFileOperation`, `fileOperationReason` in `src/file-navigator/file-operation-result.ts` | The return type of `resolve`, and wrapping thrown `fs` errors, as `editToolTextFile` does. |
| Temp-dir fixtures | `src/file-write/target.test.ts` (`mkdtempSync` under `tmpdir()` wrapped in `realpathSync`, `writeAt`, `caseInsensitiveVolume`) | Test setup pattern, including the skip on a case-sensitive volume. |

## Proposed changes

- New `src/file-patch/view-entry.ts`: the exported `PatchPlace` and `PatchContent` types and one function that, given the root, the requested path, and a successful `WriteTarget`, computes the keys and link text and, for a new content key, reads, decodes, and BOM-strips the file and takes its mode. It returns a `FileOperationResult`.
- New `src/file-patch/view.ts`: `createPatchView` and `PatchView`, holding the two maps, the first-appearance order, the dev/ino link lookup, the two planned-folder checks, and `plannedFolders()`. It re-exports nothing; subplans import the types from `./view-entry.js` and the view from `./view.js`. Both files use `.js` relative imports and stay well under 200 lines; keep each function under the cognitive-complexity limit of 15.
- No existing file is edited.

## Tests

New `src/file-patch/view.test.ts` (vitest `server` project) with temp-dir fixtures set up as `src/file-write/target.test.ts` does, covering:

- An existing file resolves once. A second `resolve` doesn't read it again: change the file on disk between calls and the view keeps the first content, and both calls return the same place object.
- An existing file's content entry holds its original bytes (BOM included when present), its mode (a file `chmod`ed to `0o640` records `0o640`), and its decoded text, and its place exists on disk and now.
- A missing path resolves as absent with no original and no current text, and its missing folders recorded shallowest first. Two missing paths under one new folder, once both places are marked existing now, give that folder once from `plannedFolders()`, and folders at two depths come shallowest first. A missing place left not existing now plans nothing.
- Outside-root (`../x`, an absolute path), `.git/config`, `.janissary/x`, a directory, the root itself (`.`), a secret path (`.env`), a non-UTF-8 file, a NUL-holding file, and an over-5 MB file each fail with their reason, and none of them adds a place.
- A BOM file decodes without its BOM, and the entry records that it had one.
- A link to an in-root file: the content's real path is the target, the place's location is the link, and its link text is recorded. Resolving the target by name gives a second place pointing at the same content entry, read once. A dangling link, and a path under a dangling link, fail with `Not a text file`. A link to an outside file fails with `Outside the workspace`.
- Two spellings of one file (`a.txt` and `./sub/../a.txt`) share one place and one content entry. On a case-insensitive volume (skipped otherwise, as `target.test.ts` does), `A.txt` and `a.txt` share one place, and case-only spellings of a link share one place.
- A path naming a planned folder fails with `Is a directory`, and a path under a place the view holds as existing now fails with the exact ENOTDIR string. After that place's exists-now flag is cleared, the path under it resolves.
- `places()` lists places in first-appearance order with the path as first typed.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- No manual check: nothing reaches the view from the app until subplan 14.

## Out of scope

- Applying sections and the `File not found` / `File already exists` rules (subplan 5), Move semantics (subplan 6), and the text checks on resulting text (subplan 5).
- Writing anything to disk (subplan 7).
- Guarding against outside processes changing files mid-patch, and on-disk backups (source plan, Out of scope).
- Binary file content (source plan, Out of scope: tool writes are text only).
- Unifying case-only spellings of paths that don't exist yet.
