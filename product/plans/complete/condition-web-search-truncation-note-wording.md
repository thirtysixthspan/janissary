# Make the web search truncation note's wording conditional

**Complexity: 1/10** — no production code, no production files edited, one wording requirement, no test scenarios (p=2.07).

## Goal

`product/specs/web-search.md` (Output), `help/web.md` (Output), the Truncation decision in `product/plans/complete/web-search.md`, and the pull request body's What paragraph each say that when results are left out the list ends with `(showing <k> of <n> results; raise --max-chars for more)`. `cutFirstResult` in `src/web-search/render.ts` drops that note when the first result's link line and the note cannot share `--max-chars`, and the same paragraphs already say so. The first truncation sentence in each place must carry that condition, so no paragraph claims the note is unconditional.

The description's `--max-chars 200` verification step carries the same unconditional expectation, and the backlog entry's Existing Risk names it as the run that can print no note for a long first-result URL. It gets the condition too.

The delivered rendering does not change.

## Approach

1. **`product/specs/web-search.md` (Output).** Reword the first truncation sentence to: "When results do not all fit within `--max-chars` and the first result's link line leaves room for the note, the list ends with `(showing <k> of <n> results; raise --max-chars for more)`." Keep the following sentences, including "When the link line and the note cannot share the budget, the note is dropped and the link line is printed alone" and "If its link line alone is longer than the budget, the link line is printed whole with no snippet."

2. **`help/web.md` (Output).** The same reworded first sentence. Keep "The first result always appears; its snippet is cut and ends in `…` when needed, the note is dropped when it cannot fit alongside the link line, and a link line too long for the budget prints whole with no snippet."

3. **`product/plans/complete/web-search.md` (Truncation decision).** Reword to: "The output keeps as many whole results as fit within `--max-chars`, in order, and when any were left out and the first result's link line leaves room for the note, it ends with `(showing <k> of <n> results; raise --max-chars for more)`; the budget includes that line." Keep the rest of the decision, including the note-dropped and over-budget-link sentences.

4. **Pull request body.** In the What paragraph, change "when some are left out, ends with" to "when some are left out and the first result's link line leaves room for it, ends with". In the How to verify truncation step, make the expected note conditional on the same room and state that a link line that cannot share the budget prints alone.

## Design decisions

1. **State the condition once, in the first sentence.** Each paragraph already carries the drop rule in a later sentence, so the first sentence only needs the same condition. A reader who stops after the first sentence then sees the qualified claim rather than an absolute one.

2. **Do not touch the code or its tests.** `cutFirstResult` already behaves this way, and `src/web-search/render.test.ts` pins the 150-, 147-, and 143-character boundaries. Only prose changes, so the rendering cannot drift.

3. **Correct the description's verification expectation.** The backlog entry calls out that run specifically. Leaving it unconditional would contradict the corrected What paragraph and read as a truncation regression to a reviewer following the steps.

4. **Leave the canonical plan's Verification step alone.** It is a manual expectation outside the Truncation decision, and the entry names only the design decision for the plan file.

## Implementation steps

1. Edit the Output paragraph in `product/specs/web-search.md`.
2. Edit the Output paragraph in `help/web.md`.
3. Edit the Truncation decision in `product/plans/complete/web-search.md`.
4. Run `$janissary/scripts/run.mjs check-diff`; markdown-only changes should scope nothing to lint, typecheck, or test and must exit 0.
5. After the push, revise the pull request body's What paragraph and its truncation verification step, then apply it with `gh pr edit --body-file ./temp/pr-body.md`.

## Tests

No automated tests. The change is prose in a spec, a help page, the canonical plan, and the pull request description, so there is no test surface. `src/web-search/render.test.ts` stays untouched and must keep passing; `check-diff` confirms it does.

Manual verification: read each revised passage against `cutFirstResult` in `src/web-search/render.ts` and confirm that no sentence claims the list always ends with the note, that the note-dropped sentence and the over-budget-link sentence remain, and that the 150-, 147-, and 143-character cases still describe the boundary the tests pin.

## Out of scope

- `src/web-search/render.ts`, `src/web-search/render.test.ts`, and every other source or test file.
- The canonical plan's Verification step and any other plan paragraph.
- Specs, help pages, or user documentation beyond the Output paragraphs named above.
- The other entries in `product/backlog/pull-request.md`.
