# Align the PDF find completion announcement in documentation

**Complexity: 1/10** — This corrects one screen-reader announcement in the PDF user guide and its behavior spec. The implementation and its existing assertion already use the exact wording.

## Goal

Document the exact announcement readers hear when a PDF search reaches the ten-row cap.

## Approach and implementation

1. Update `product/specs/pdf-tab.md` to include the implemented `found.` ending in the capped-results announcement.
2. Update `documentation/user-documentation/tab-types/pdf-viewer.md` to quote the same announcement.

## Tests

The existing capped-results assertion in `web/src/plugins/pdf/PdfTab.test.tsx` already checks `10 or more matching lines found.` No test or implementation change is needed for this documentation correction. Run `./scripts/run.mjs check-diff` after the plan and documentation changes.

## Out of scope

- Changes to PDF search behavior or tests.
- Changes to the pull request description.
- New documentation pages.
