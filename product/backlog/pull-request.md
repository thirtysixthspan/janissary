<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle case-insensitive PDF matches whose lowercase form changes length.

Existing Issue: `contiguousMatch` and `occurrencesInLayer` use offsets from lowercased text as offsets into the original UTF-16 text, so a match after a character such as `İ` starts at the wrong position in the result row and PDF text layer. Severity: 4/10

Existing Risk: 4/10 - A PDF containing a lowercasing-expanding character before a match can show only part or none of that match as emphasized in the result row and page.

Proposal Risk: 1/10 - Mapping matches back to original UTF-16 offsets and pinning the expansion case in tests makes the result and page marks align, with only an untested Unicode mapping edge left to risk.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "map case-insensitive PDF match offsets to their original text positions". Preserve the existing case-insensitive matching while mapping transformed-string offsets back to original UTF-16 ranges in `contiguousMatch` in `web/src/shared/fuzzy-match.ts` and `occurrencesInLayer` in `web/src/plugins/pdf/pdf-find-marks.ts`. Add regression cases to `web/src/shared/fuzzy-match.test.ts` and `web/src/plugins/pdf/pdf-find-marks.test.ts` with source text beginning `İneedle` and query `needle`, asserting that the result row and the DOM range emphasize the complete original substring at its source position. Keep the current ASCII, cross-span, overlapping-occurrence, and line-boundary behavior covered by those test files.
