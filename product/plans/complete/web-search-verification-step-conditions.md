# State the web-search verification steps' result-count, snippet, and truncation-note conditions

**Complexity: 1/10** — no production code, files, requirements, scenarios, or units change; two intent documents only (p=1.58).

## Goal

`product/plans/complete/web-search.md` Verification steps 1 and 5, and the pull request body's Happy paths steps 1 and 2, promise output the delivered feature does not always print. Step 1 promises three results each with an indented snippet, while a search can return fewer than `--results` and the renderer prints only the link line for a result whose snippet is empty. Step 5 promises the truncation note unconditionally, while the renderer omits it when no results were left out and prints the link line alone when the link and note cannot share the budget. The plan's Result count, Output, and Truncation decisions, the Output section of `product/specs/web-search.md`, and `help/web.md` already state the true behavior, so these four steps are the only stale artifacts.

## Approach

Reword the four steps so each names the condition the renderer applies, leaving the commands, step numbers, and every other step byte-for-byte. `src/web-search/render.ts` and `src/web-search/render.test.ts` stay untouched: `renderResult` already prints only the link line for an empty snippet, `wholeResultCount` and `cutFirstResult` already gate the note on results left out, and the render suite pins the boundary cases.

## Implementation steps

1. In `product/plans/complete/web-search.md`, reword Verification step 1 to expect up to three results, each a `- [<title>](<url>)` line followed by an indented snippet line when the provider supplied one and only the link line otherwise.
2. Reword Verification step 5 to expect fewer than ten results, with the note when results were left out and the first result's link line leaves room for it, and the link line alone when the link and note cannot share the budget.
3. After the commit is pushed, apply the same conditions to Happy paths steps 1 and 2 of the pull request body through `gh pr edit --body-file`, preserving every other paragraph exactly.
4. Move this plan to `ready/` once its wording is final, then to `complete/` after publication, and remove the resolved backlog entry.

## Tests

No runtime behavior changes. Run `$janissary/scripts/run.mjs check-diff` after each edit; `src/web-search/render.test.ts` must pass unchanged.

## Spec and documentation

The Output section of `product/specs/web-search.md` and the output section of `help/web.md` already state the result count, link-only result, and truncation-note conditions. No spec, help, or user-documentation change is needed.

## Out of scope

Changing `src/web-search/render.ts` or its tests, the commands or other steps in either document, the behavior spec, help pages, user documentation, or the pull request's title and unrelated description text.
