# Keep the file patch case probe going past root entries it cannot canonicalize

**Complexity: 3/10** — ~22 added production lines, 1 file, 4 requirements, 3 scenarios, 1 new unit (p=4.22)

## Goal

On a volume that ignores letter case, the file patch view must keep folding case-only spellings even when the workspace root's first lettered entry is a broken symbolic link, or when an empty root's own name has no ASCII letter. Today those roots are misreported as case-sensitive, so `*** Add File: a.txt` followed by `*** Add File: A.txt` writes twice and reports two added rows for one file. The probe must stay read-only and must still answer case-sensitive only when it has evidence.

## Approach

`volumeIgnoresCase` in `src/file-patch/volume-case.ts` asks `probeEntries` for the first lettered root entry's verdict, and `sameEntry` folds every failure into `false`. A broken symbolic link makes `lstatSync` succeed for both spellings but `realpathSync.native` fail, so the entry is reported as a different file even though both spellings name one entry. A root with no entries leaves `probeEntries` with nothing to read, and `probeName` has no letter to toggle when the root's basename is non-ASCII, so both fall through to `false`.

`sameEntry` will distinguish a confirmed different entry from an inconclusive one. A toggled spelling that does not exist is a confirmed `false`, and so is a device/inode mismatch. An `lstat` failure on the original path, any other `lstat` failure on the toggled path, or a `realpathSync.native` failure after both spellings matched by device and inode is `undefined`. `probeEntries` then continues past an inconclusive entry to the next lettered one instead of returning its verdict, and reports `undefined` only when no entry is conclusive. The final chain is root entries, then the root's basename under its parent, then the entries of its nearest existing ancestor directories, and only then `false`. Nothing is written.

## Implementation steps

1. In `src/file-patch/volume-case.ts`, change `sameEntry` to return `boolean | undefined`. Return `undefined` when `lstatSync` fails on the original path or fails on the toggled path for a reason other than `ENOENT`; return `false` when the toggled path is absent or the device or inode differs; return `undefined` when `realpathSync.native` fails after the device and inode match; otherwise return whether the canonical paths are equal.
2. Change `probeEntries` to record each lettered entry's verdict and continue when it is `undefined`, returning the first conclusive verdict or `undefined` when none is conclusive.
3. Add `probeAncestorEntries(candidate)`: start at `path.dirname(candidate)`, return the first conclusive `probeEntries` result, and walk to the parent until reaching the filesystem root, returning `undefined` if no ancestor decides.
4. In `volumeIgnoresCase`, chain `probeEntries(resolved) ?? probeName(resolved) ?? probeAncestorEntries(resolved) ?? false`.
5. In `src/file-patch/view.test.ts`, add the two probe cases described under Tests next to the existing reports-the-case-behavior case.
6. In `product/specs/acp.md`, extend the file patch volume paragraph to say the case-only behavior applies to every root on such a volume, including one holding a broken symbolic link and one whose own name has no ASCII letter.

## Tests

- `src/file-patch/view.test.ts`: a root whose only lettered entry is a broken symbolic link still reports the same volume case behavior as a read-only case toggle of the test root.
- `src/file-patch/view.test.ts`: guarded on a case-insensitive volume, an empty root whose basename has no ASCII letter reports case-insensitive, exercising the ancestor entries.
- The existing `reports the case behavior the existing case toggle observes` case, every case-only view case, and the case-only apply case stay passing.

## Out of scope

- Changing `resolveMutationTarget` in `src/file-write/target.ts`, `placeKeys` in `src/file-patch/view-entry.ts`, or how existing paths are canonicalized.
- Changing the view's folding indexes, planned-folder keys, row output, or messages.
- Changing `help/file.md` or user documentation; neither describes the probe.
- Making every exotic filesystem or a root with no readable ancestor detect correctly; the probe still answers case-sensitive when it has no evidence.
