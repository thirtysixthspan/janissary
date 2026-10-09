# Fix: carry both sides' line numbers in the diff tab's rows

**Complexity: 6/10** — one optional field on the line record the wire already shares between server and client, two gutters per row in the unified layout, the left column's own number in the split one, and the tests on both sides. The parser already walks both sides' counters, so the change is what the record carries and what the rows render.

## Goal

Every row shows the file's number on **both** sides: the original number blank on an added line and the new number blank on a removed one in the unified layout, and the original number on the left of a split row with the modified one on the right — where today a row carries one number, the side it sits on, and a split row's left column shows the *new* file's number for a context line.

## Approach

The requirement is what the payload's line record should have carried from the start: the old-side number, which the unified record omits because git prints the removed side's number for a removed line and the new side's for everything else. The parser walks both counters already, in `hunkLines` in `src/plugins/diff/parse-diff.ts`.

1. **The wire carries the old-side number.** `DiffLine` in `src/plugins/diff/shared.ts` gains `oldNumber?: number` — the line's position on the original side, present for a context or removed line and absent for an added one, which has no position before it. `isDiffLine` checks the optional field, and `DIFF_PAYLOAD_SCHEMA_VERSION` becomes 3 because the record's shape changed. `hunkLines` writes the number it already had.
2. **The unified row shows two gutters.** `HunkLines` renders the old number and the new one, each blank where the line has no position on that side, so a context line carries both and a replaced line carries the one it owns.
3. **The split columns carry their own sides' numbers.** `SplitSide` renders the old side's number for the old column — `oldNumber`, which for a removed line is the line's own number — and the new side's for the new column, where the same context line had been showing the new-side number on the left.

## Implementation steps

1. Add `oldNumber` to the line record, its guard, and the schema-version bump in `src/plugins/diff/shared.ts`.
2. Write the number the parser already walks in `src/plugins/diff/parse-diff.ts`.
3. Render the two gutters in `web/src/plugins/diff/HunkLines.tsx` and each side's own number in `web/src/plugins/diff/SplitHunks.tsx`.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. Extend `src/plugins/diff/parse-diff.test.ts`, `web/src/plugins/diff/DiffTab.test.tsx`, and the fixtures' shared line records with the cases below.
6. Run `./scripts/run.mjs check-diff` and resolve any failures.
7. Update `product/specs/diff-tab.md` for the two gutters and the split columns.
8. Check `help.md` and `documentation/user-documentation/` for a line-number claim, and update it only if present.

## Tests

- A context line's record carries its old-side number, and an added line's carries none.
- The unified row shows both gutters with the blank on the side the line has no position on, for an added line and for a removed one.
- The split layout's left column shows the original number for a context line, where it had shown the modified one.

## Out of scope

- A click on a gutter as its own target, which the row's double-click already answers.
- Copying a row, which today copies its text and not its numbers by design.
- The gutters' width, which stays the muted right-aligned `3ch` the tab already uses.
