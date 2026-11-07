# PDF find announcements for assistive technology

**Complexity: 3/10** — add an optional live announcement to the shared find overlay and drive it from the existing PDF read state, with focused component and deferred-page coverage.

## Goal

Make asynchronous PDF text-search progress and results available to screen-reader users while the find input keeps focus. Keep the visible `Reading pages…` row and leave editor and shell find behavior unchanged.

## Approach

`LineFind` currently renders result rows and its optional visible status as ordinary elements. Add an optional, visually hidden polite status region for callers that supply announcement text. The PDF find hook already owns `reading`, `results`, and `query`, so it can announce when reading starts, when the first matching results arrive, and when reading finishes. It should not announce individual pages. When the result list reaches its ten-row cap, say “10 or more matching lines” rather than imply that ten is the total.

## Implementation steps

1. Add the optional announcement prop and an accessible status region to `LineFind`, with a focused test for its role and polite live behavior. Add the visually hidden style next to the find overlay styles. Run `./scripts/run.mjs check-diff`.
2. Extend `usePdfFind` with PDF-only announcement state and transition handling, then pass it from `PdfTab` to `LineFind`. Keep the status stable across page arrivals and announce the first matching results only once. Run `./scripts/run.mjs check-diff`.
3. Add deferred-page PDF tab tests for reading start, first results, final count, and the final no-match state. Run `./scripts/run.mjs check-diff`.
4. Update the Find section of `product/specs/pdf-tab.md` and the existing PDF find description in `documentation/user-documentation/tab-types/pdf-viewer.md` to describe the announcements and the ten-result cap wording. Run `./scripts/run.mjs check-diff`.

## Tests

- `web/src/shared/line-find/LineFind.test.tsx`: the optional announcement is exposed as a polite atomic status region.
- `web/src/plugins/pdf/PdfTab.test.tsx`: deferred reads announce that reading started, announce matching results once as they arrive, and announce the final count when reading completes; a deferred query with no matches announces the final no-match state, and a result list at its ten-row cap announces “10 or more.”
- Run `./scripts/run.mjs check-diff` after each implementation step and after the spec update.

## Out of scope

- No changes to editor or shell find announcements, visible PDF status wording, matching, ranking, or result-row selection.
- No help update; help pages do not describe PDF find progress.
- No pull-request description correction.
