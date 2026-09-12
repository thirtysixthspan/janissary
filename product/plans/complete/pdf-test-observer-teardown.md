# Keep PDF test observers available through teardown

Complexity: 2/10.

## Goal

Fix the intermittent `IntersectionObserver is not defined` failure in the PDF header test. The observer is already stubbed before each test, but the file's teardown restores globals before the shared React cleanup runs. Pending page effects can therefore reach a missing browser API during unmount.

## Approach

Own the teardown order locally in the PDF test suite: clean up mounted React trees before restoring browser globals and mocks. Keep production rendering and shared test configuration unchanged.

## Implementation steps

1. Add a lifecycle regression in `web/src/plugins/pdf/PdfTab.test.tsx` that records whether both observer stubs remain available when the loaded document is destroyed by automatic test teardown, and checks the result after teardown. Confirm it fails with the existing ordering, then call React Testing Library cleanup before restoring globals and mocks. Run `./scripts/run.mjs check-diff`.
2. Clarify in `product/specs/pdf-tab.md` that the initial header and controls are available before a page is drawn, matching the existing header assertions. No help or public documentation changes are needed because runtime behavior is unchanged. Promote this plan to complete and run check-diff before shipping.

## Tests

One new teardown regression, plus all existing PDF tab tests including metadata, navigation, lazy rendering, resizing, cancellation, and late failures. Run the client suite after the focused checks to exercise the reported failure under broader load.

## Out of scope

Production observer fallbacks, global browser API mocks, other test suites, PDF rendering changes, dependencies, and unrelated backlog entries. The named issue is absent from the empty issues backlog, so no backlog edit is needed.
