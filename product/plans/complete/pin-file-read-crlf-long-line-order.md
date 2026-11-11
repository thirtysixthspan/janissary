# Pin the file read formatter's carriage-return-before-cut ordering

**Complexity: 1/10** — test-only change: two new cases in one existing test file, no production code, no new units (0 lines added, 0 files edited, 1 requirement, 2 scenarios, p=2.47).

`displayLine` in `src/file-read/format.ts` removes one trailing carriage return from a line and only then compares the line with `FILE_READ_MAX_LINE_LENGTH`, as the long-lines decision in `product/plans/complete/move-janissarys-acp-tool-loop-2-file-read-format.md` requires. No test feeds a CRLF line at the cut boundary, so swapping the two steps would pass the whole suite while making every CRLF file with a line of exactly the maximum length show a spurious ellipsis and lose its last real character.

## Goal

The suite fails if the carriage return is measured as part of the line or removed after the cut.

## Verified against the code

`displayLine` strips the trailing `\r` on its first line, then checks `line.length <= FILE_READ_MAX_LINE_LENGTH`, then cuts by code point. The ordering the reviewer described is already what the code does, so both new tests are expected to pass as written; a failure would be a real defect in `displayLine`.

## Approach

Add two cases to the existing `formatFileLines long lines` describe block in `src/file-read/format.test.ts`, building every input from `FILE_READ_MAX_LINE_LENGTH` rather than a literal 2000. No change to `src/file-read/format.ts`.

## Implementation steps

1. Add `leaves a CRLF line of exactly the maximum alone`: input `'x'.repeat(FILE_READ_MAX_LINE_LENGTH) + '\r\n'`; expect `1\t` followed by exactly `FILE_READ_MAX_LINE_LENGTH` `x` characters, with no `…` and no `\r`.
2. Add `cuts a CRLF line one character over the maximum`: input `'x'.repeat(FILE_READ_MAX_LINE_LENGTH + 1) + '\r\n'`; expect `1\t`, the first `FILE_READ_MAX_LINE_LENGTH` `x` characters, then `…`, with no `\r`.
3. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

The two cases above are the tests. The existing CRLF and long-line tests stay untouched and must keep passing.

## Out of scope

- Any change to `src/file-read/format.ts`.
- A lone carriage return at the end of a file with no final newline, which the subplan never specified.
- Specs and help pages: no user-visible behavior changes.
