# Pin PDF find announcement edge cases

## Complexity

2/10. The change adds two focused deferred-page regression cases, clarifies the existing PDF find behavior spec, and removes one resolved backlog item.

## Goal

Keep the PDF find completion announcements covered when text extraction finishes with an empty query and when exactly one line matches.

## Approach

Use the existing deferred page helpers in `PdfTab.test.tsx` to hold text extraction open until the assertions can distinguish the pending announcement from its completed state. Keep the query empty through the final page resolution in one case, and search for a single matching line in the other. Preserve the existing reading, first-results, zero-match, and capped-result cases. Update `product/specs/pdf-tab.md` to state the exact singular result announcement alongside the empty-query completion message.

## Implementation steps

1. Add two deferred-page cases to `web/src/plugins/pdf/PdfTab.test.tsx` for the exact completion messages.
2. Clarify the find announcement behavior in `product/specs/pdf-tab.md`.
3. Remove the resolved entry from `product/backlog/pull-request.md` while retaining the empty-file skeleton.

## Tests

- With the query empty until the final deferred page resolves, the status announcement is `Document text is ready to search.`.
- When deferred extraction completes with one matching line, the status announcement is `1 matching line found.`.
- Existing assertions for reading, first results, zero matches, and capped results remain in place.
- The diff-scoped checks completed successfully after each change.

## Out of scope

- Changing the PDF find announcement implementation.
- Changing result matching, ranking, or the ten-row cap.
- Updating public documentation for already-described screen-reader behavior.
