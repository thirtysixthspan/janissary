<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Pin the file read formatter's rule that a line's trailing carriage return is removed before the long-line cut is measured, which no test covers today.

Existing Issue: The formatter strips one trailing carriage return before comparing a line with the 2000-code-point cut, as the subplan's long-lines decision requires, but no test feeds a CRLF line of exactly the maximum length, so swapping those two steps would still pass the whole suite. Severity: 2/10

Existing Risk: 3/10 - A later refactor that measures or cuts the line before removing the carriage return would make every CRLF file with a line of exactly 2000 characters show a spurious ellipsis and drop its last real character, and nothing would catch it before users saw it.

Proposal Risk: 1/10 - The ordering is pinned by a test, leaving only orderings the subplan never specified, such as a lone carriage return at the very end of a file with no final newline, which would show up as a new test failure if anyone changed that rule.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "add a test pinning that the file read formatter removes a trailing carriage return before measuring the long-line cut". In `src/file-read/format.test.ts`, add a case to the `formatFileLines long lines` describe block that builds `'x'.repeat(FILE_READ_MAX_LINE_LENGTH) + '\r\n'` and expects `formatFileLines` to return `1\t` followed by exactly `FILE_READ_MAX_LINE_LENGTH` `x` characters with no `…` and no `\r`, and a second case with `'x'.repeat(FILE_READ_MAX_LINE_LENGTH + 1) + '\r\n'` that expects the cut line followed by `…` and no `\r`. Build both inputs from `FILE_READ_MAX_LINE_LENGTH`, not a literal 2000, per the subplan `product/plans/complete/move-janissarys-acp-tool-loop-2-file-read-format.md`. Do not change `src/file-read/format.ts`; `displayLine` there already strips the carriage return first, so both tests should pass as written, and if either fails that is a real defect to fix in `displayLine`. Verify with `$janissary/scripts/run.mjs check-diff`, which runs the formatter's tests; the existing CRLF and long-line tests in the same file must keep passing untouched.
