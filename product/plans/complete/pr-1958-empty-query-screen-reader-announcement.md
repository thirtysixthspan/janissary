# Complete the PR description's empty-query screen-reader announcement

**Complexity: 2/10** — a correction to one named paragraph in pull request #1958. No source, test, spec, or user documentation changes.

## Goal

Make the pull request description account for the screen-reader completion message after PDF text finishes loading while the search query is empty.

## Problem

The implementation's `finalAnnouncement()` in `web/src/plugins/pdf/usePdfFind.ts` returns `Document text is ready to search.` when the query is empty. The PR description names the reading, first-result, and final-result announcements but omits this completion message.

## Decision

Add `Document text is ready to search.` to the existing screen-reader paragraph, associated with reading finishing while the query is empty. Keep the paragraph's existing announcement sequence and leave every other part of the PR body unchanged.

## Changes

### Pull request body, applied after the push

- Update only the screen-reader paragraph to include the empty-query completion message.
- Keep the existing announcement sequence and all other paragraphs and sections unchanged.

### Backlog

- Remove the selected first entry from `product/backlog/pull-request.md`.
- Preserve the two remaining entries byte-for-byte.

### Plan

- Move this plan from `draft/` to `ready/`, then to `complete/`.

## Tests

No tests are added or changed. This work documents existing behavior only; the announcement sequence and assertions in `web/src/plugins/pdf/PdfTab.test.tsx` remain unchanged. Run `./scripts/run.mjs check-diff` for the repository's diff-scoped checks.

## Spec

No spec change. The behavior already exists and this work only completes the PR description.

## Docs

None needed. No user-facing behavior or existing user documentation changes.

## Out of scope

- Changes to `web/src/plugins/pdf/usePdfFind.ts` or its tests.
- Changes to the remaining two pull-request backlog entries.
- The PR title or any description text outside the named screen-reader paragraph.
