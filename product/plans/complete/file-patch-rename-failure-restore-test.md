# Pin the restore after a rename into a re-created vacated path

**Complexity: 1/10** — no production code changes; one verification requirement and one rewritten commit test (p=2.32)

## Goal

Make the commit test that covers a rename failure into a vacated path that the patch re-created exercise that rename, not a later write. The case named `restores a vacated path when a rename into it fails` must fail the `rename` call whose destination is the re-created path, so it pins the third commit-test scenario promised by `product/plans/complete/file-patch-restore-vacated-recreated-path.md`: the path's original bytes and mode survive, the failing rename's source path is reported, and the failed patch leaves the other paths as they were.

## Approach

The runner already provides the behavior the test must pin. `changes.ts` keeps the delete entry that holds the vacated path's original bytes and mode, `commit.ts` unlinks that entry before replaying renames and records its undo, and a rename failure reports `move.from.requested` while `restore.ts` writes the kept bytes back. The gap is in the test: the current case overrides `writeFile` and fails the first write, which runs only after the rename into the re-created `b` has already succeeded, so no rename into `b` ever fails and the restore path the plan promised is untested. Rewrite that case to inject the failure in `rename` when its destination is `b`, and keep the same patch shape without the trailing `later` add. The later-write restore for this shape stays pinned by `restores a vacated path that a later section re-creates`, so no second case is needed. Production code, commit ordering, and the delete filter do not change.

## Implementation steps

1. In `src/file-patch/commit.test.ts`, rewrite the case named `restores a vacated path when a rename into it fails`. Keep the setup `write('b', 'original\n', 0o640)` and `write('d', 'other\n')`, and keep the patch sections `*** Update File: b`, `*** Move to: c`, `*** Delete File: c`, `*** Update File: d`, `*** Move to: b`. Replace the `writeFile` override with a `rename` override that throws the existing `fail()` result when `to` is `file('b')` and otherwise delegates to `defaultCommitOperations.rename`. Assert the outcome with `toMatchObject({ ok: false, restored: true, path: 'd' })`, that `b` holds `original\n` with mode `0o640`, that `d` still reads `other\n`, and that `c` is absent.
2. Leave every other commit test untouched, in particular `restores prior writes, moves, deleted links and modes after a write failure`, `handles replacement, vacated paths, exchanges and intermediate folders`, `deletes, moves and updates links without replacing their targets`, `restores a vacated path that a later section re-creates`, the destination-new row case, and the return-to-origin move in `preserves ordered hops, chains and net changes`.

## Tests

- `src/file-patch/commit.test.ts`: the rewritten `restores a vacated path when a rename into it fails` case pins the rename-failure restore. The injected rename failure targets the destination `b`, so the patch's delete of `b` must be undone with the original bytes and mode, `d` must remain unchanged because its rename never completed, and `c` must stay absent.
- The other commit cases listed above must keep passing untouched; `restores a vacated path that a later section re-creates` remains the pin for the later-write shape of the same patch.

## Out of scope

- Changing `src/file-patch/commit.ts`, `src/file-patch/changes.ts`, `src/file-patch/restore.ts`, or any other production code.
- Adding a second write-failure case under a rename name; the existing later-section case already pins that shape.
- Changing `product/specs/acp.md`, which already states that a failed patch puts back every path it changed, including one it vacated and later re-created, or any help or user documentation, since behavior does not change.
