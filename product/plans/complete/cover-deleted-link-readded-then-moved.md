# Cover the deleted link re-added as a regular file and then moved

**Complexity: 1/10** — test-only coverage: no production lines or files changed, 2 behavioral requirements, 3 test scenarios (p=2.86)

## Goal

Pin the behavior of a patch that deletes a symbolic link, adds a regular file at the link's path, and then moves that file. The delete must report the original link as removed, the move chain must stay off disk so no rename is replayed, the added content must be written at the destination, and a failed write must restore the original link rather than leaving the tree half-changed.

## Approach

`moveSection` in `src/file-patch/moves.ts` computes `replacedLink` as true when the source place has a recorded delete carrying link text and the current source is no longer a link. That happens here: Delete File records `linkText: 'target'`, Add File clears the place's link text and gives it fresh content, and Update File with Move to sees a regular file whose delete entry still remembers the link. `recordMove` then creates a chain with `onDisk: false`.

That off-disk chain drops out of the `active` list in `buildPatchChanges`, so `changes.moves` is empty, the destination's write survives as the added text, and the original link appears in `changes.deletes` with its link text. `patchRows` reports `D link` and `A moved`, since the chain does not qualify for an `R`. The implicit `target` place is skipped.

`commitChanges` consumes that change list: it unlinks the recorded link and writes the added file at `moved`, leaving `target` untouched. With an injected `writeFile` failure, the commit's undo records hold the link restore, so the failure path recreates the symbolic link and leaves `moved` absent.

## Implementation steps

1. In `src/file-patch/sections.test.ts`, add a case after `handles links, shared content, and recreation` named `unlinks a deleted link re-added as a regular file and then moved`. Create `target` with `old\n` and a `link` symbolic link to `target`. Apply `*** Delete File: link`, `*** Add File: link` with `+new`, and `*** Update File: link` then `*** Move to: moved`. Assert `changes.moves` is empty, `changes.deletes` is exactly one entry for `link` with `linkText: 'target'`, `changes.writes` is exactly one entry with `text: 'new\n'` and final place `moved`, and `rows` is exactly `[{ letter: 'D', path: 'link' }, { letter: 'A', path: 'moved' }]` in that order.
2. In `src/file-patch/commit.test.ts`, add a case named `commits a deleted link re-added as a regular file and moved`. Run the same patch against the same initial tree and assert it succeeds, `moved` is a regular file containing `new\n`, `link` is gone, and `target` is unchanged. Then restore the initial tree, rerun the same patch with a `writeFile` failure injected from `defaultCommitOperations`, and assert the result reports a restored failure at `moved`, `readlinkSync(link)` is `target`, and `moved` is absent.
3. Make no production code change, no spec change, and no help or user-documentation change; the behavior and its documentation already exist.

## Tests

- `src/file-patch/sections.test.ts`: the new case pins the empty move list, the delete of the original link with its target, the write at the destination, and the exact `D` then `A` rows.
- `src/file-patch/commit.test.ts`: the new case pins the committed tree and the restore of the original link after a write failure.
- The existing `handles links, shared content, and recreation` case in `sections.test.ts` and `deletes, moves and updates links without replacing their targets` case in `commit.test.ts` must keep passing untouched.

## Out of scope

- Changing `replacedLink`, the on-disk condition, or any other production code.
- Adding a spec section or changing `help/file.md`; this only pins behavior that is already documented.
