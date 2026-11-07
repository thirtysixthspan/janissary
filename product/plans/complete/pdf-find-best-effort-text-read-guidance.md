# PDF Find best-effort text-read guidance

**Complexity: 2/10** — documentation-only correction grounded in the existing PDF behavior and coverage.

## Goal

Explain in the PDF user guide that Find skips a page whose text read fails and keeps searching the rest of the document without notifying the user. Distinguish that best-effort search behavior from a selectable text-layer render failure, which fails the document.

## Background

The PDF guide currently describes a page whose text does not come through as a document render failure, but does not explain that Find handles a rejected page text read by skipping it and continuing. `product/specs/pdf-tab.md` already defines those as separate cases. `web/src/plugins/pdf/usePdfFind.test.ts` already covers a rejected page being skipped while later pages still contribute results.

## Approach

Update only the two relevant passages in `documentation/user-documentation/tab-types/pdf-viewer.md`: name the selectable text-layer render failure under `When a PDF won't open`, and state the per-page skip, continued search, and lack of notification under `Finding text`. Keep the existing specification and test unchanged because they already describe and verify the intended behavior.

## Implementation steps

1. Update the two relevant passages in `documentation/user-documentation/tab-types/pdf-viewer.md` together: clarify that the render failure under `When a PDF won't open` is a selectable text-layer render failure, and state under `Finding text` that an unreadable page is skipped, search continues through the rest of the document, and no notification is sent.
2. Verify the existing rejected-page behavior with the focused PDF Find test and run `./scripts/run.mjs check-diff` after the guide update.
3. Remove this resolved entry from `product/backlog/pull-request.md`, preserving the file's required comment-and-heading skeleton when empty.
4. Promote this plan to `product/plans/complete/` after the guide and backlog changes are verified.

## Tests

No new tests are needed because this change does not alter behavior. The existing rejected-page case in `web/src/plugins/pdf/usePdfFind.test.ts` verifies that a failed page read is skipped and later pages are still searched. Run `./scripts/run.mjs check-diff` after each change, including the guide and backlog edits.

## Out of scope

- Changing PDF rendering, Find behavior, or any application code.
- Changing the existing PDF Find test or the already accurate `product/specs/pdf-tab.md` behavior description.
- Changing the pull request description.
