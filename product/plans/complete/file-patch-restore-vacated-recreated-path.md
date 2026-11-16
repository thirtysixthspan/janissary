# Restore a vacated file patch path that is re-created later

**Complexity: 2/10** — ~5 added production lines, one production file, three behavioral requirements, five test scenarios (p=3.90)

## Goal

When a patch moves a path away, deletes the moved copy, and then re-creates the original path, a commit-time write or rename failure must restore that path's original bytes, permissions, and link text instead of unlinking the re-created file. A rename into the re-created path must also have an undo. The change list keeps the vacated path's delete entry in that shape, while a move that ends where it started still produces no delete and leaves the file untouched.

## Approach

`buildPatchChanges` currently keeps a recorded delete only when the place is absent at the end or was explicitly deleted. That drops the entry holding the original bytes, mode, and link text when a move vacates a path, a later section deletes the moved copy, and a later section re-creates the vacated path: the re-creation records fresh content whose `original` is `undefined`, so a failed commit unlinks the new file instead of restoring the old one, and a rename into the path overwrites it with no undo.

`moveSection` in `src/file-patch/moves.ts` already records the delete when it vacates a source, and `commit.ts` already unlinks deletes before renames and writes and records a delete undo in `restore.ts`. Keep the entry whenever the place existed and is not the origin of an active move chain, except when a move chain ends at its origin. A chain that returns to its origin leaves the disk file untouched because no rename is replayed, so no unlink or undo is needed there; keeping its delete would silently unlink a file the net change keeps. An explicit delete keeps its current behavior through `removedByDelete`, which also covers a delete and re-add that follows a returning move.

`rows.ts` reads places and chains, not the delete list, so `A`/`M`/`D`/`R` output is unchanged.

## Implementation steps

1. In `src/file-patch/changes.ts`, compute the origins of move chains whose current place is their origin, and extend the delete filter so a recorded delete is kept when its place existed, is not the origin of an active chain, and either is absent at the end, was explicitly deleted, or is not the origin of a returning chain. Add a comment saying the kept entry is the only holder of the place's original bytes, mode, and link text for restore, and that a chain ending where it started leaves the path untouched.
2. In `product/specs/acp.md`, under the file patch tool, state that a patch that fails while writing puts back every path it changed, including one it vacated and later re-created, restoring original bytes, permissions, and symbolic links.

## Tests

- `src/file-patch/sections.test.ts`: a new case with `b` present and the sections `*** Update File: b`, `*** Move to: c`, `*** Delete File: c`, `*** Add File: b`, `+new` asserts `changes.deletes` names `b` and holds `b`'s original bytes; the same shape with `a` moving to `b` asserts it names `a`.
- `src/file-patch/commit.test.ts`: run the same patch with a `writeFile` failure injected on the re-created path and assert `b` is restored byte-for-byte with its mode and `c` is absent; repeat with `b` a symbolic link and assert `readlinkSync` returns its target.
- `src/file-patch/commit.test.ts`: run `*** Update File: b`, `*** Move to: c`, `*** Delete File: c`, `*** Update File: d`, `*** Move to: b` with a rename failure and assert `b`'s original bytes survive and `d` remains.
- Keep `restores prior writes, moves, deleted links and modes`, `handles replacement, vacated paths, exchanges and intermediate folders`, `deletes, moves and updates links without replacing their targets`, the destination-new row case, and the return-to-origin move in `preserves ordered hops, chains and net changes` passing untouched.

## Out of scope

- Changing commit ordering, undo handling, or `rows.ts`.
- Changing help wording; `help/file.md` already promises that a failed patch leaves every file as it was.
- Removing `removedByDelete`; it still keeps an explicit delete that follows a returning move.
