# Move the cut-to-result-count test claim to the file that owns it

**Complexity: 1/10** — no production code changed, no production files edited, one requirement (p=2.07).

## Goal

The Tests section of `product/plans/complete/web-search.md` places the cut-to-`numResults` assertion in `src/web-search/render.test.ts`, but `renderResults` in `src/web-search/render.ts` takes `(results, total, maxChars)` and has no result-count parameter, so `render.test.ts` cannot and does not cover the cut. The cut happens in `src/web-search/search.ts` inside `renderSearch`: `dedupeResults(normalizeResults(results)).slice(0, request.numResults)`, and the case "dedupes before cutting to numResults" lives in `src/web-search/search.test.ts`. The plan's next Tests bullet describes `search.test.ts` without mentioning it.

A reader using the plan's test inventory would look for the coverage in the render suite, conclude it is missing, and either duplicate the test or distrust the inventory. The fix moves the claim to the bullet that describes the search core's own tests.

## Approach

Edit two existing Tests bullets in `product/plans/complete/web-search.md` and nothing else:

1. Remove `cut to \`numResults\`; ` from the `src/web-search/render.test.ts` bullet.
2. Add `the cut to \`numResults\` after dedupe; ` to the `src/web-search/search.test.ts` bullet, after its `No results for "<query>".` clause.

Leave every other line of the plan byte-for-byte, including the remaining render coverage (dedupe key, truncation, snippet cut, empty list) and the rest of the search bullet (fallback, request copies, aborts, provider names).

No code, test, spec, help page, or user documentation changes. The test suite itself already has the coverage; only the plan's description of it is wrong.

## Design decisions

1. **Correct the inventory, do not move coverage.** `renderResults` rightly has no result-count parameter: the core cuts before rendering, so moving the cut into render would change production behavior for no benefit. The entry asks for a plan correction only.

2. **Name both halves of the operation.** The new clause says "after dedupe" because the search test pins the order: duplicates are dropped before the count is applied, so two duplicate URLs cannot consume the result budget. The old bullet's bare "cut to `numResults`" omitted that relationship.

3. **Keep the render bullet's real coverage untouched.** `render.test.ts` still covers the dedupe key algorithm itself, which belongs there; only the result-count cut claim leaves it.

## Implementation steps

1. Read `src/web-search/render.ts`, `src/web-search/search.ts`, `src/web-search/render.test.ts`, and `src/web-search/search.test.ts` to confirm the split: `renderResults(results, total, maxChars)`, the `.slice(0, request.numResults)` in `renderSearch`, and the "dedupes before cutting to numResults" case in the search suite.
2. In `product/plans/complete/web-search.md`, remove `cut to \`numResults\`; ` from the `src/web-search/render.test.ts` bullet.
3. In the same file, add `the cut to \`numResults\` after dedupe; ` to the `src/web-search/search.test.ts` bullet.
4. Run `$janissary/scripts/run.mjs check-diff` and confirm it exits 0.
5. Confirm with `git diff` that only those two spans in the Tests section changed, and that the plan's production description and design decisions are untouched.

## Tests

No automated tests. The change is prose in one plan file, and the assertions it describes already exist and pass. Run `$janissary/scripts/run.mjs check-diff` after the edit; markdown changes are lint-only and the command must exit 0.

Manual verification: read the Tests section and confirm the render bullet no longer claims the result-count cut, the search bullet names "the cut to `numResults` after dedupe", and no other line of the file differs.

## Out of scope

- Changing any code, test, spec, `help/`, or user documentation file.
- Moving the cut, or any other behavior, between `render.ts` and `search.ts`.
- Editing any other line of `product/plans/complete/web-search.md`.
- Resolving anything else on the branch.
