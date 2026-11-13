<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Close a security gap in the mutation path display helper by also escaping Unicode bidirectional-control and invisible formatting characters, so a crafted file name cannot make an outcome line show a different path than the one written.

Existing Issue: The path display helper for file write and edit outcome lines escapes only C0, DEL, C1, U+2028, and U+2029, so bidirectional overrides and isolates (U+202A–U+202E, U+2066–U+2069) and the marks U+200E, U+200F, and U+061C pass through raw and can reorder how the reported path renders. Severity: 3/10

Existing Risk: 4/10 - Once the executors print these lines, an agent-chosen path such as one carrying U+202E can render to the user's terminal or transcript as a harmless-looking name while a different file was written, a Trojan Source style spoof of the one line meant to tell the user what changed.

Proposal Risk: 1/10 - The rendered path always shows its true logical order with the controls visible as escapes, leaving only homoglyph look-alikes, which no escaping scheme of this shape can address.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "escape bidirectional and invisible formatting controls in the mutation path display helper". In `src/file-write/messages.ts`, extend the code-point test used by `displayPath` (the local `isEscapedCode` helper) so that U+061C, U+200E, U+200F, U+202A through U+202E, and U+2066 through U+2069 are also rendered as `\u` plus four lowercase hex digits, keeping the single forward scan over code points with no regex and leaving backslash, spaces, and ordinary non-ASCII letters unchanged. Add cases to `src/file-write/messages.test.ts` under the `displayPath` describe that build a path from each of those code points with `String.fromCodePoint` (as the existing control-character test does) and assert the exact escaped output and that a mixed path such as one containing U+202E renders the escape rather than the raw character. Update the escaping design decision in `product/plans/complete/janissary-hosted-agent-write-tool-2a-contract-and-messages.md` so it lists the added ranges, since it currently says every other code point is left unchanged. The existing `displayPath` and formatter tests in `src/file-write/messages.test.ts` cover the behavior that must not move and must keep passing unchanged; verify with `$janissary/scripts/run.mjs check-diff`.


* Pin the path display helper's U+2029 escape with a test, since the implementation escapes it but nothing would notice if that branch were dropped.

Existing Issue: The path display helper escapes U+2029 (paragraph separator), a line-breaking character in many renderers, but the colocated tests exercise U+2028 and never U+2029, so that branch of the escape test is unpinned. Severity: 2/10

Existing Risk: 2/10 - A later edit to the escape range, for example tightening it to a single U+2028 comparison, could silently let a paragraph separator through and break the one-line guarantee the executors rely on, with no test failing.

Proposal Risk: 1/10 - Every character the helper documents escaping is asserted, so a regression in the range shows up as a failing test rather than a broken output line.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1996 "add a test pinning the U+2029 escape in the mutation path display helper". In `src/file-write/messages.test.ts`, extend the `displayPath` case that escapes line breaks, tabs, and control characters to include U+2029 (add a `PARAGRAPH_SEPARATOR_CODE = 0x20_29` constant beside the existing `LINE_SEPARATOR_CODE`, add it to the code list, and add the matching `u2029` escape), so the test asserts the path renders it as the six-character escape ` ` and stays on one line. Do not change `src/file-write/messages.ts`; it already escapes U+2029 in `isEscapedCode`. Verify with `$janissary/scripts/run.mjs check-diff`, confirming the new assertion passes and that temporarily removing the `0x20_29` comparison from `isEscapedCode` makes it fail.
