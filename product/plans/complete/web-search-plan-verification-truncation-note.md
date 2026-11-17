# State the truncation note's condition in the web-search plan's verification step

**Complexity: 1/10** — no production code, no production files edited, one expected-result condition (p=2.07).

## Goal

Verification step 5 in `product/plans/complete/web-search.md` tells a verifier to run `web search node.js permission model --max-chars 200` and expect the `(showing <k> of <n> results; raise --max-chars for more)` line without a condition. The same plan's Truncation decision, the Output section of `product/specs/web-search.md`, the Output section of `help/web.md`, and the pull request body's truncation step all say the note is dropped when the first result's link line and the note cannot share the budget. The plan's verification step therefore disagrees with the rule every other artifact states, and a verifier who hits a long first URL reads the missing note as a truncation regression.

The fix rewords that one step so its expected result carries the same condition. Everything else in the plan stays as it is.

## Approach

Add the condition to step 5's expected result: fewer than ten results, the note when the first result's link line leaves room for it, and a link line that cannot share the budget with the note printed alone. Keep the command, the step number, and the rest of the sentence's shape. The wording mirrors the pull request body's truncation step so the two verification surfaces read the same way.

Check the reworded step against the plan's Truncation decision, the Output sections of `product/specs/web-search.md` and `help/web.md`, and the truncation cases in `src/web-search/render.test.ts`. `cutFirstResult` in `src/web-search/render.ts` already returns the link line alone when `link.length + note.length > maxChars`, and the render suite pins that boundary at 150 characters, the note-without-snippet boundary at 147, and the ellipsis-only snippet at 143, all against the 200-character budget the step uses.

No code, test, spec, help page, or user documentation changes. The delivered behavior and every document already agree; only the plan's verification step is stale.

## Design decisions

1. **Add the condition, don't remove the note.** The note is real output and the step should still name it. The missing piece is when it appears, so the step gains the condition rather than losing the expectation.

2. **Use the pull request body's phrasing.** Its truncation step already reads "fewer than ten results, ending with a line of the form ... when the first result's link line leaves room for it; a link line that cannot share the budget with the note prints alone". Reusing that shape keeps the plan and the body from drifting apart again.

3. **Say "fewer than ten results".** The default `--results` is ten and a 200-character budget cannot hold ten results, so the expectation names the count the verifier should see instead of the vaguer "fewer results".

4. **One line changes.** The command, the step number, the other verification steps, the manual remote check, and every design decision stay byte-for-byte. The plan file is the only file edited besides the backlog removal.

5. **Leave the renderer and its tests alone.** `cutFirstResult` is already correct and the suite pins the boundaries. This is a documentation correction, not a behavior change.

## Implementation steps

1. Read Verification step 5 in `product/plans/complete/web-search.md`, the Truncation decision in the same file, the Output sections of `product/specs/web-search.md` and `help/web.md`, and the truncation cases in `src/web-search/render.test.ts`.
2. Replace step 5's expectation with: fewer than ten results, ending with the `(showing <k> of <n> results; raise --max-chars for more)` line when the first result's link line leaves room for it, and a link line that cannot share the budget with the note printed alone.
3. Run `$janissary/scripts/run.mjs check-diff`.
4. Run `git diff` and confirm the only change in the plan is that one step, with every other line, including the Truncation decision and the manual remote check, byte-for-byte unchanged.

## Tests

No automated tests. The change is prose in one plan file, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the edit; markdown changes are lint-only and the command must exit 0.

Manual verification: read the reworded step beside the plan's Truncation decision, the two Output sections, and the three render cases at 150, 147, and 143 characters. Diff the plan to confirm no other line changed.

## Out of scope

- Changing any other line of `product/plans/complete/web-search.md`.
- Changing `src/web-search/render.ts`, `src/web-search/render.test.ts`, or any other code or test.
- Changing `product/specs/web-search.md`, `help/web.md`, or any other spec or help page.
- Changing the pull request title or body.
- Resolving the other entry in `product/backlog/pull-request.md`.
