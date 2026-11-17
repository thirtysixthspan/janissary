# Repoint technical-debt paths from src/web-search to the src/web tree

**Complexity: 1/10** — documentation-only edit to two backlog paragraphs, no production files, behavioral requirements, test scenarios or new units (p=1.58).

## Goal

Two entries in `product/backlog/technical-debt.md` cite source paths that the web rename removed. A contributor working either debt item would edit or create files at paths that no longer exist, and the shared-flag-grammar entry omits the `web fetch` grammar this pull request adds. Repoint the stale paths and flag names so the backlog matches the renamed tree, without touching scores, risks, or any other part of the file.

## Approach

Verify every replacement path and name against the code before writing it. Change only paths and names inside the two Proposal paragraphs; leave each entry's summary bullet, Existing Debt, Existing Risk, Proposal Risk, every score, and every other entry byte-for-byte unchanged. Where a new path is added to a list, place it beside the path it accompanies in the current text.

## Implementation steps

1. In the `file-operations` entry (the one beginning "Move the file-safety policy, refusal vocabulary, and remote-tab helpers out of the read and navigator features into one shared file-operations module"):
   - Replace both `src/web-search/tab-search.ts` mentions with `src/web/search/tab-search.ts`.
   - Add `src/web/fetch/tab-fetch.ts` beside `src/web/search/tab-search.ts` as a further importer in both the `remote-tab-port.js` sites list and the `tab-read.js` helper sites list.

2. In the shared-`CommandSpec` entry (the one beginning "Define each file and web command's flags once, and generate its parser, completion candidates, and usage text from that definition"):
   - Replace `src/web-search/command.ts` with `src/web/search/command.ts` and `src/web-search/command.test.ts` with `src/web/search/command.test.ts`.
   - Add `src/web/fetch/command.ts` (`parseWebFetch`, `WEB_FETCH_USAGE`) and its test `src/web/fetch/command.test.ts` to the parser and test lists.
   - Note that `src/web/flag-scan.ts` (`scanFlagArguments`) is now the shared web scan loop, so the web commands no longer carry a local `scanArguments`.
   - Replace `WEB_FLAGS` with `SEARCH_FLAGS`, `FETCH_FLAGS`, and `FORMAT_VALUES` from `src/completion/web.ts`.

## Tests

No test can distinguish documentation text from before to after; lint, typecheck, and the test suites are unaffected by a backlog-only edit. Verification is a grep confirming no stale `src/web-search/` file paths and no `WEB_FLAGS` remain in the two edited entries, plus `$janissary/scripts/run.mjs check-diff` staying clean after each step.

## Out of scope

- Editing source, tests, specs, help pages, or user documentation; this is a backlog-text-only change.
- Changing any score, or the substance of either entry beyond the stale paths and names.
- The generic word "web-search" in the `file-operations` entry's Existing Debt paragraph: it names the module family descriptively, not a file path, so it stays.
- Editing `product/backlog/issues.md` or any file other than `product/backlog/technical-debt.md` for this fix.
