# Qualify the find description's no-text and mark claims

**Complexity: 2/10** — a pull-request description correction only, with no code, test, spec, or help changes. The two replacement phrases are named by the resolved entry and both already match the implemented trim behavior and the spec's wording.

## Goal

The pull request body overstates two find states. Its no-text sentence says a document with no text, such as a scan of page images, answers every query with `No matching lines`. Its marks paragraph says every occurrence on the drawn pages is marked while the query is non-empty. Neither holds for an empty or whitespace-only query: the overlay trims the query first, so it shows `type to search` and paints no marks on every document, including a no-text one.

The implementation already behaves this way:

- `web/src/shared/line-find/LineFind.tsx` returns the `type to search` body when `!query.trim()`, before it considers results, status, or `No matching lines`.
- `web/src/plugins/pdf/usePdfFindMarks.ts` returns before painting when the trimmed query is empty, so no mark reaches the drawn pages.
- `product/specs/pdf-tab.md` § Find and `product/plans/complete/pdf-tab-find.md` both already say non-whitespace, so the description is the only artifact that needs correcting.
- `LineFind` and `usePdfFindMarks` tests pin both states, so no test needs to change.

## Approach

Change only the pull request body, and apply it only after the commit is pushed. In the no-text sentence of the What section, replace "answers every query" with "answers every non-whitespace query". In the marks paragraph, replace "while the query is non-empty" with "while the query has non-whitespace text".

Every other paragraph, heading, and the title stay exactly as written. No change-set statistics or commit SHAs are added. The resolved backlog entry is removed, and its file is restored to the comment-and-heading skeleton because it was the only entry.

## Implementation steps

1. Confirm the two target phrases appear exactly once in the live body read with `gh pr view 1958 --json body`, and save that body to `./temp/pr-body.md`.
2. Replace "answers every query" with "answers every non-whitespace query" in the What section's no-text sentence. Change nothing else in that paragraph.
3. Replace "while the query is non-empty" with "while the query has non-whitespace text" in the What section's marks paragraph. Change nothing else in that paragraph.
4. Compare the revised body with the saved original to confirm only those two phrases changed and the title is untouched.
5. Apply the body with `gh pr edit 1958 --body-file ./temp/pr-body.md`.
6. Move this plan from `ready/` to `complete/` and remove the resolved entry from `./product/backlog/pull-request.md`, restoring the exact comment-and-heading skeleton.

## Tests

No automated test changes. Both states are already pinned by the existing `LineFind` and `usePdfFindMarks` tests, and those must stay green under `$janissary/scripts/run.mjs check-diff`.

Verification runs:

- `$janissary/scripts/run.mjs check-diff`
- `npm run test:client -- web/src/shared/line-find/LineFind.test.tsx web/src/plugins/pdf/usePdfFindMarks.test.tsx`

## Out of scope

- Any code change in `LineFind.tsx`, `usePdfFindMarks.ts`, or the PDF tab; the trim behavior is implemented and tested.
- Any spec change: `product/specs/pdf-tab.md` § Find already says non-whitespace for both claims.
- Help and user documentation: neither describes these query states.
- The pull request title and every unrelated description paragraph.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes.
- The focused find tests pass.
- `gh pr view 1958 --json state,headRefName,headRefOid` shows the PR `OPEN` on `feature/pdf-tab-find` at the pushed commit.
- The live body contains both corrected phrases, with every other paragraph unchanged and no change-set statistics or SHAs.
