<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Pin the path display helper's U+2029 escape with a test, since the implementation escapes it but nothing would notice if that branch were dropped.

Existing Issue: The path display helper escapes U+2029 (paragraph separator), a line-breaking character in many renderers, but the colocated tests exercise U+2028 and never U+2029, so that branch of the escape test is unpinned. Severity: 2/10

Existing Risk: 2/10 - A later edit to the escape range, for example tightening it to a single U+2028 comparison, could silently let a paragraph separator through and break the one-line guarantee the executors rely on, with no test failing.

Proposal Risk: 1/10 - Every character the helper documents escaping is asserted, so a regression in the range shows up as a failing test rather than a broken output line.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "add a test pinning the U+2029 escape in the mutation path display helper". In `src/file-write/messages.test.ts`, extend the `displayPath` case that escapes line breaks, tabs, and control characters to include U+2029 (add a `PARAGRAPH_SEPARATOR_CODE = 0x20_29` constant beside the existing `LINE_SEPARATOR_CODE`, add it to the code list, and add the matching `u2029` escape), so the test asserts the path renders it as the six-character escape ` ` and stays on one line. Do not change `src/file-write/messages.ts`; it already escapes U+2029 in `isEscapedCode`. Verify with `$janissary/scripts/run.mjs check-diff`, confirming the new assertion passes and that temporarily removing the `0x20_29` comparison from `isEscapedCode` makes it fail.
