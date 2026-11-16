# Keep the first-result note inside the web search character budget

**Complexity: 2/10** — ~2 added lines in one production file, three requirements and three test scenarios, no new units (p=3.60).

## Goal

A web search's first result must not push its output past `--max-chars` unless the link line alone is longer than the budget. In `src/web-search/render.ts`, `cutFirstResult` builds `note = "\n(showing 1 of <n> results; raise --max-chars for more)"` and computes `room = maxChars - link.length - 3 - note.length` for the snippet. When `room <= 1` it returns the link line and the note together without checking that the two fit. A 150-character link line and a 52-character two-result note therefore print 203 characters at `--max-chars 200`, over budget, even though the link line alone fits. The same branch also omits an ellipsis-only snippet when `room` is exactly 1, though that snippet would fill the budget exactly.

Three outcomes replace that branch: the link line alone when the link line and the note cannot share the budget; the link line and note when they fit but leave no room for a snippet; and the link line with an indented `…` and the note when one character of snippet room remains. The existing snippet cut serves every larger room, and a link line that alone exceeds the budget still prints whole, as the spec already says.

## Approach

1. **`src/web-search/render.ts` — drop the note when it cannot share the link line.** Before computing `room`, return `link` when `link.length + note.length > maxChars`. `note` already carries its leading newline, so `link.length + note.length` is the exact length of the two-line output the old branch printed. This is the only case where that output exceeded the budget; a link line longer than the budget still prints whole.
2. **`src/web-search/render.ts` — lower the snippet guard to `room <= 0`.** With the over-budget note handled first, `room <= 0` means the link line and note fit but no snippet line does, so they print without one, exactly as before. A `room` of 1 now falls through to the existing cut, which yields an indented `…` in the single character available and keeps the note, filling the budget exactly.
3. **Leave untouched** the whole-result selection, `withNote`, `cutSnippet`, the lone-high-surrogate drop, and every other render path. The behavior change is the guard plus the lowered comparison.

## Design decisions

1. **The budget includes the note, so the note yields first.** `--max-chars` bounds the printed list, and the note is part of it. When the link line and note cannot both fit, the note is the part that goes: it is a report about omitted results, while the first result's title and URL are the answer. Printing the link line alone is the only outcome that stays within the budget and still shows that answer.

2. **Keep the note when it fits, even with no snippet.** When the link line and note fit but the three characters that precede a snippet line do not, the note is kept and the snippet is omitted. Dropping the note there would hide that results were cut even though no budget pressure required it.

3. **`room === 1` prints `…` rather than dropping the snippet line.** One character of snippet room can hold the ellipsis itself, so the output reads as a cut snippet and fills the budget exactly. `cutSnippet(snippet, 1)` already returns `…` for an empty slice; no special case is needed.

4. **No new helper and no new module.** The guard is one line inside `cutFirstResult`. `render.ts` is 119 lines, so the addition stays far under the 200-line limit.

5. **Spec, help, and the feature plan state the drop.** The behavior is user-visible, so `product/specs/web-search.md`, `help/web.md`, and the canonical plan's Truncation decision and render test inventory all need the corrected rule; none of them may describe the old branch.

## Implementation steps

1. Edit `cutFirstResult` in `src/web-search/render.ts`: add `if (link.length + note.length > maxChars) return link;` before the `room` calculation, and change `if (room <= 1)` to `if (room <= 0)`.
2. Run `$janissary/scripts/run.mjs check-diff`.
3. Add the three boundary cases to `src/web-search/render.test.ts`.
4. Run `$janissary/scripts/run.mjs check-diff`.
5. Replace the Truncation paragraph of `product/specs/web-search.md` so it states that the note is dropped when it cannot fit alongside the link line, that the note alone follows the link line when no snippet fits, and that a single remaining character prints `…`.
6. Make the same rule in the output paragraph of `help/web.md`.
7. Update the Truncation design decision and the `src/web-search/render.test.ts` Tests bullet of `product/plans/complete/web-search.md`.
8. Run `$janissary/scripts/run.mjs check-diff` and confirm that only the production file, its test file, the behavior spec, the help page, the canonical plan, this plan, and the backlog entry changed.

## Tests

Three new cases in `src/web-search/render.test.ts`, all at `maxChars: 200` with two results, a two-result note of `(showing 1 of 2 results; raise --max-chars for more)`, a `Long` title, a URL padded with repeated `a`s, and a short first snippet:

- **A 150-character link line drops the note.** The link line plus the note is 203 characters, so the rendered output is the link line alone, has no `(showing` line, and is within the budget.
- **A 147-character link line keeps the note without a snippet.** The link line plus the note is exactly 200 characters, so the rendered output is those two lines with no snippet and no budget overrun.
- **A 143-character link line keeps an ellipsis-only snippet.** The link line, the two-space indent, `…`, and the note are exactly 200 characters, so the rendered output ends with the ellipsis line followed by the note.

Existing coverage that must keep passing: `renders a Markdown list with an indented snippet and no header or trailing newline`, `keeps the leading whole results that fit and notes how many it shows`, `keeps every result when the budget equals the full rendering and drops one a character less`, `uses the total argument verbatim as the note denominator`, `cuts the first result snippet with an ellipsis so the output fits the budget`, `does not leave a lone high surrogate at the end of a cut snippet`, `prints first result link line longer than the budget whole, with no snippet`, and `renders an empty list as an empty string`.

## Out of scope

- The whole-result selection in `wholeResultCount`, the note wording, and duplicate or normalization behavior.
- A result with no snippet that reaches `cutFirstResult`: the fix only makes its single-character case match the larger rooms, and adds no special rule for an empty snippet.
- `search.ts`, the command grammar, the providers, ACP wiring, and remote search.
- User documentation, which does not describe the truncation boundary.
- The rest of the pull-request backlog.
