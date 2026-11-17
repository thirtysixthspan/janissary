# Bound the patch hunk and anchor search

**Complexity: 5/10** — ~120 added production lines, 1 edited file, 6 requirements, 6 scenarios, 7 new units (p=5.06)

## Goal

A patch within the 5 MB argument cap must not spend time proportional to the product of the file's line count and each hunk block's length, and an anchored hunk must not scan from its current position to the end of the file. Matching cost should grow with the size of the file and the patch together, so a large file and a large patch cannot hold the synchronous patch runner, and the server's event loop, for minutes or hours.

The match chosen must be exactly the match the current nested scan chooses: the first exact match at or after the current position wins, a trailing-whitespace match is tried only when no exact match exists, hunks are searched sequentially after the previous match, and `*** End of File` matches only the last possible position.

## Approach

`applyHunks` splits the text once and then builds one line index for that snapshot, which is valid for the whole call because replacements are assembled only after every hunk has been located. The index has two tables: one keyed by the exact line text and one, built lazily when an exact search first fails, keyed by the line text with trailing whitespace removed. Each table maps a key to its interned numeric id and its sorted list of positions, and carries two polynomial rolling-hash prefix arrays over the ids.

`@@` anchors become a binary search for the first position of the anchor line at or after the current position, exact table first and relaxed table second. A context-and-removed block starts from the block's first-line position list, skips positions whose rolling hash differs from the block's hash in constant time, and compares the full block only where the hash agrees. Candidates are visited in ascending order, so the first verified match is the same first match the nested scan found. Verification keeps the result exact even if two different line sequences share a hash.

An end-of-file block has exactly one possible position, so it is compared directly in exact order and then relaxed order, as today.

## Implementation steps

1. Add `src/file-patch/hunk-search.ts` with `createLineSearch(lines)` returning `{ findLine(line, from), findBlock(block, from, endOfFile) }`. Internally build the exact line table on the first search that needs it and the trailing-whitespace table on the first relaxed lookup, so an insertion-only patch on a large file still costs nothing beyond splitting the text. Each table holds a `Map` from key to `{ id, positions }` and two `Uint32Array` prefix-hash arrays with matching power arrays, using two independent 32-bit polynomial bases so accidental collisions are negligible while full-block verification remains the correctness check. `findLine` lower-bounds the position list; `findBlock` handles the empty block, the end-of-file single position, and the two ordered phases over the first-line candidates.
2. In `src/file-patch/hunks.ts`, remove the local `findBlock` and call `createLineSearch(source.lines)` once before the hunk loop. Route the anchor lookup through `findLine(hunk.anchor, position)` and the context-and-removed lookup through `findBlock(old, position, hunk.endOfFile)`, leaving `splitText`, `replacementLines`, the replacement assembly, and every failure line unchanged.
3. In `src/file-patch/hunks.test.ts`, add the two large-input cases described under Tests.
4. In `product/specs/acp.md`, add one sentence to the file patch section stating that hunk and anchor matching cost grows with the file and patch sizes rather than their product, so a large patch on a large file does not stall other sessions.

## Tests

- New case in `src/file-patch/hunks.test.ts`: a 200,000-line file whose lines all read `x`, and one hunk whose 100,000-line block is 99,999 context lines plus a removed `y` line. No position can match, so the result is the existing `No matching text` failure for `x`. The old nested scan performs roughly ten billion line comparisons at candidate positions; the indexed search compares the block only at matching hashes. Completing inside the default test timeout is the assertion that the scan is bounded.
- New case in `src/file-patch/hunks.test.ts`: a 200,000-line file with several hundred anchored insertion hunks whose anchors sit at increasing late positions. Assert the inserted lines appear in order and at the right anchors, which exercises the binary-search anchor lookup and the sequential position advance.
- Existing exact-before-relaxed ordering, first-match-wins, sequential repeated-block, relaxed anchor, end-of-file, insertion-order, large-replacement, and line-ending cases in `src/file-patch/hunks.test.ts` must keep passing unchanged.
- The mixed example in `src/file-patch/apply.test.ts` and every hunk case in `src/file-patch/sections.test.ts` must keep passing unchanged.

## Out of scope

- Any user-visible patch behavior, failure vocabulary, parser rule, or file-size limit. No comparison budget or refusal path is introduced, so `help/file.md` needs no new reason.
- Moving the patch runner to a worker or making it cancellable.
- Reusing an index across separate `applyHunks` calls; each call receives a new text snapshot after an earlier section changed the file, so the index is built per call.
- The rest of `src/file-patch/`: parsing, sections, moves, folders, rows, commit, and restore.
