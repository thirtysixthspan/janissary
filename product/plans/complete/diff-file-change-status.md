# Fix: name each diff tab file entry's change status in its header

**Complexity: 4/10** — one optional field on the file record, one pure status mapping, a badge in the header, and the tests on both sides. The two labels the payload cannot tell apart today are what the new field is for.

## Goal

Every file entry's header names what happened to the file — **added**, **modified**, **deleted**,
**renamed**, **binary**, or a mode-only change — as a word the reader can scan by, with the color behind
it as the secondary cue, in the header the row already carries and so visible when the entry is
collapsed.

## Approach

The record already carries `deleted`, `oldPath`, and `binary`, so those three statuses need nothing new.
What it cannot tell apart is a file that did not exist before from a file whose change only added
lines — an append reads as additions with no deletions — and the parser already knows the difference:
`--- /dev/null` is what git prints for a file that has no original side.

1. **The record carries it.** `DiffFile` in `src/plugins/diff/shared.ts` gains `added?: boolean`, set in
   `finish` from the `oldIsNull` the parser already records, and the payload's schema version becomes 4
   with the client registry's literal moved to match — the version the two sides must agree on, the one
   the parity test now pins for diff.
2. **The mapping is pure.** `web/src/plugins/diff/status.ts` answers one status per record with the
   precedence the header implies: a binary entry opens the media tab, a deleted file's name is inert, a
   rename names both paths, an added file holds only new content, and a record with no hunks and none of
   the above is a mode-only change.
3. **The badge.** `FileEntry` renders the label beside the counts in the header, colored from the row
   colors the tab already uses — the success green for an addition, the error red for a deletion, the
   muted gray for everything else — because the word is the cue and the color the second one.

## Implementation steps

1. Add `added` to `DiffFile` and its guard in `src/plugins/diff/shared.ts`, bump `DIFF_PAYLOAD_SCHEMA_VERSION`, set the field in `finish`, and move the client registry's diff literal to the same version.
2. Add `web/src/plugins/diff/status.ts` with the status mapping and `web/src/plugins/diff/status.test.ts`.
3. Render the badge in `web/src/plugins/diff/FileEntry.tsx` and add its rule to `web/src/plugins/diff/diff.css`.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Extend `src/plugins/diff/parse-diff.test.ts` and `web/src/plugins/diff/DiffTab.test.tsx` with the cases below.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.
7. Update `product/specs/diff-tab.md` with the status badge.
8. Check `help.md` and `documentation/user-documentation/` for a file-status claim, and update it only if present.

## Tests

- The parser marks a file whose `---` line is `/dev/null` as added, and leaves an ordinary modification unmarked.
- The mapping answers each status for its record, and a binary or deleted record wins over the label its counts would suggest.
- Every entry's header carries its status label, and the label is there when the entry is collapsed.

## Out of scope

- Icons beside the labels, which the words already cover and the requirement names as an alternative.
- The status of a workspace clone, which is a root rather than a file.
- The mode-only entry's own labeling of what mode changed.
