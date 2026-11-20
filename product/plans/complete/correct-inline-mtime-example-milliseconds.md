# Correct the inline mtime example in help/file.md to show milliseconds

**Complexity: 1/10** — documentation-only, single-string edit in one help page; no production code, no behavioral requirements, no new test scenarios and no new units (p=1.578)

## Problem

The "Listing and inspecting paths" section of `help/file.md` describes a row's modification time as "an ISO UTC timestamp such as `2026-11-19T13:50:00Z`", a shape the formatter never emits, immediately beside the corrected `2026-11-19T13:50:00.000Z` example row. `formatFileRow` in `src/file-row.ts` renders dates with `new Date(stat.modified).toISOString()`, which always includes milliseconds, and the row-shape assertion in `src/file-row.test.ts` pins `2026-11-19T13:50:00.000Z`. The inline example therefore describes a shape the formatter never produces, so a reader treating it as the output contract could mis-compare or mis-parse real rows. This completes the remaining goal stated in `product/plans/complete/correct-file-row-example-milliseconds.md`, which identified the no-millisecond spelling but did not correct this inline occurrence.

## Goal

Make the inline mtime example in `help/file.md` agree with the formatter and its pinned tests by showing the millisecond precision `toISOString()` actually emits. Change only that one documentation string; the formatter output is already correct.

## Approach

Treat `toISOString()` as a settled design decision and leave `src/file-row.ts` and every test untouched. Correct the single named inline mtime spelling by hand, then re-read the paragraph against the row-shape assertion in `src/file-row.test.ts` so the documented shape matches the pinned output word for word. No PR-description correction is needed for this work item.

## Implementation steps

1. In `help/file.md`'s **Listing and inspecting paths** section, change the inline example `2026-11-19T13:50:00Z` in the phrase "the modification time as an ISO UTC timestamp such as `2026-11-19T13:50:00Z`" to `2026-11-19T13:50:00.000Z`, leaving the adjacent example row and every other paragraph unchanged.
2. Re-read the corrected paragraph and confirm the inline example matches the row-shape assertion `file -rw-r--r-- 1234 2026-11-19T13:50:00.000Z notes.md` in `src/file-row.test.ts`.

## Tests

- No new tests. The behavior is unchanged; the existing row-shape assertions already pin the `.000Z` spelling and must keep passing untouched.
- `$janissary/scripts/run.mjs check-diff` runs the affected server tests and confirms those assertions still pass after the documentation edit.

## Specs and documentation

- No spec update: this corrects documentation to match existing behavior, and `product/specs/file-list-stat.md` does not describe the row shape.
- `help/file.md`: the inline mtime example named above. No other help page or user-documentation page describes this mtime.

## Out of scope

- No change to `src/file-row.ts`, `toISOString()`, or any row-formatting behavior.
- No change to the row-shape assertions in any test file.
- No change to the adjacent example row in `help/file.md` or to any other paragraph.
- No PR title or description change, and no edit to paragraphs the work item does not name.
- No merge, close, replacement PR, force-push, or push to any other branch.
