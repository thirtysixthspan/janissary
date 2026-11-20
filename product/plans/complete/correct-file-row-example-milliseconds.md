# Correct the file-row examples to show milliseconds

**Complexity: 1/10** — documentation-only correction, no production code lines or files, no behavioral requirements, no new test scenarios and no new units (p=1.578)

## Problem

The PR body's Behavior examples and the `help/file.md` reference page show mtimes like `2026-11-19T13:50:00Z`, but `formatFileRow` in `src/file-row.ts` renders dates with `new Date(stat.modified).toISOString()`, which always emits milliseconds. The row-shape assertions in `src/file-row.test.ts`, `src/file-list/tab-list.test.ts`, `src/file-stat/tab-stat.test.ts`, and `src/remote/filesystem/stat-path-operation.test.ts` already pin `2026-11-19T13:50:00.000Z`. The published examples therefore describe a shape the formatter never produces, and a reader treating them as the output contract would mis-compare or mis-parse real rows.

## Goal

Make the PR description's row examples and the `help/file.md` example row agree with the formatter and its pinned tests by showing the millisecond precision `toISOString()` actually emits. Change only documentation; the formatter output is already correct.

## Approach

Treat `toISOString()` as a settled design decision from `product/plans/complete/supplement-file-command-with-additional-sub-commands.md` and leave `src/file-row.ts` untouched. Correct the examples by hand, replacing only the named mtime spellings, then re-read each corrected example against the assertions that pin the row shape so the docs match word for word. Apply the PR-body correction with `gh pr edit --body-file` after the commit and push, writing the full revised body to a scratch file first so every paragraph the work item does not name survives byte-for-byte.

## Implementation steps

1. In the PR body's **Behavior examples** block, change each `2026-11-19T13:50:00Z` mtime to `2026-11-19T13:50:00.000Z` in the `file list .` block, the `file ls .` block, and the `file stat notes.txt` block — five row mtimes in total. Leave every other paragraph, the title, and the rest of the body verbatim.
2. In the PR body's **How to verify** section, change step 1's `Expect:` wording from "ISO-UTC mtime" to "ISO-UTC mtime carrying milliseconds", leaving the rest of that paragraph verbatim.
3. In `help/file.md`'s **Listing and inspecting paths** section, change the example row `file -rw-r--r-- 1234 2026-11-19T13:50:00Z notes.md` to `file -rw-r--r-- 1234 2026-11-19T13:50:00.000Z notes.md`, leaving the surrounding description unchanged.
4. Re-read the corrected examples and confirm each matches the corresponding row-shape assertion in the four test files word for word.

## Tests

- No new tests. The behavior is unchanged; the existing row-shape assertions already pin the `.000Z` spelling and must keep passing untouched.
- `$janissary/scripts/run.mjs check-diff` runs the affected server tests and confirms those assertions still pass after the documentation edits.

## Specs and documentation

- No spec update: this corrects documentation to match existing behavior, and `product/specs/file-list-stat.md` does not describe the row shape.
- `help/file.md`: the row example named above. No other help page or user-documentation page describes this mtime.

## Out of scope

- No change to `src/file-row.ts`, `toISOString()`, or any row-formatting behavior.
- No change to the row-shape assertions in any test file.
- No PR title change, no change-set statistics in corrected paragraphs, and no edit to paragraphs the work item does not name.
- No merge, close, replacement PR, force-push, or push to any other branch.
