# Add executable manual PDF find steps to the pull request description

**Complexity: 2/10** — a short correction to the PR's `How to verify` section and this plan/backlog update; no product behavior changes.

## Goal

Give reviewers a runnable manual flow for PDF find using an existing tracked PDF fixture, including search results from an undrawn page, single-page reveal, and continuous-scroll positioning.

## Approach

Use `scripts/docs-screenshots/fixtures/sample.pdf`, which contains searchable text on both pages. In single-page mode, page 1 is initially drawn. Searching for `page` should show page-2 rows, making the cross-document search and page labels easy to verify. Selecting a page-2 result reveals that page in single-page mode. Switching to continuous scroll and selecting the text line exercises the quarter-stage reveal. Add only these steps to the PR description's `How to verify` section, preserving its existing text and every other part of the description.

## Implementation steps

1. Write concrete actions and expected results for opening the tracked PDF fixture, searching `page` from page 1, confirming page-2 results, revealing a result in single-page mode, and revealing the line in continuous scroll.
2. After the branch update is pushed, add those actions to the PR description's `How to verify` section while preserving every other paragraph.
3. Remove only the resolved entry from `product/backlog/pull-request.md`, preserving the remaining entry.

## Tests

No automated tests are needed because this fix changes only pull-request verification instructions and no application behavior. Check the wording against the tracked sample PDF's two-page contents and the existing PDF specification. Run `$janissary/scripts/run.mjs check-diff`; after publication, re-read the PR body and confirm the new steps are present while the existing `Additional test cases` section is unchanged.

## Spec

No spec change is needed. `product/specs/pdf-tab.md` already specifies whole-document search, page-numbered result rows, single-page reveal, and continuous-scroll placement about a quarter of the stage height from the top. This fix makes those existing behaviors manually reproducible in the PR description.

## Docs

No help or user-documentation change is needed because the implemented behavior does not change.

## Out of scope

- Application code, tests, or user-visible behavior.
- Changes to the PDF specification or user documentation.
- The second entry in `product/backlog/pull-request.md`.
- Any part of the PR description except the `How to verify` section.
- The PR title.
