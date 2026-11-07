# Keep PDF find marks from repainting on every page read

**Complexity: 2/10** — one memo in the PDF find hook changes what it keys on, plus two regression cases, one spec sentence, and two clarifications in the canonical plan; the marks hook and the tab stay untouched.

## Goal

The canonical plan (`product/plans/complete/pdf-tab-find.md`) says the marks repaint when the query, the highlighted row, or the text-layer counter changes. The code repaints more often than that. `usePdfFind` builds `current` in a `useMemo` keyed on `lines`, `results`, and `selected`. Every page read appends to `lines` as a new array, which gives `useLineFind` a new `lineTexts` array and so a new `results` array, even when the ranked rows are the same. While the overlay is open with at least one match, `current` therefore becomes a new object after every page read. `usePdfFindMarks` lists `current` in its effect's dependencies, so the effect's cleanup deletes every painted range and the effect walks every drawn text layer to paint them again, although the highlighted occurrence did not move.

A page read that leaves the highlighted occurrence where it was must leave `current` as the same object, so the marks are not repainted. When a read re-ranks the rows so the highlighted row is a different occurrence, `current` must still change and the current mark must follow it.

## Approach

Derive the highlighted occurrence's three primitives in the render body of `usePdfFind`: the selected result's line page, the line's index on its page, and the start of the result's first range. Each is `undefined` when there is no selected result, no line behind it, or no range. Memoize `current` on those three primitives alone, returning `null` when any is missing and `{ page, line, start }` otherwise. React compares memo dependencies with `Object.is`, so equal numbers keep the previous object and a page read that leaves the occurrence unchanged returns the same `current`.

`usePdfFindMarks`, its dependency list, and `PdfTab.tsx` stay unchanged: once `current` is stable, the effect reruns only on the triggers the plan names. The alternative of comparing `current` by value inside `usePdfFindMarks` was rejected because it would leave every other consumer of `current` with an unstable identity and move a derivation concern into the painting hook.

## Implementation steps

1. **`web/src/plugins/pdf/usePdfFind.ts`** — replace the `current` memo. Before it, compute `result = results[selected]`, `line` from `lines?.[result.index]` when `result` exists, and `start` from `result?.ranges[0]?.[0]`, then take `page = line?.page` and `lineIndex = line?.index`. Memoize `current` on `[page, lineIndex, start]`, returning `null` when any is `undefined`.
2. **`web/src/plugins/pdf/usePdfFind.test.ts`** — add the hook-level regression case below under `describe('usePdfFind revealing')`.
3. **`web/src/plugins/pdf/PdfTab.test.tsx`** — add the integration regression case below under `describe('PdfTab find marks')`.
4. **`product/specs/pdf-tab.md` § Find** — add to the marks paragraph that reading another page's text leaves the marks already painted in place unless it changes which occurrence the highlighted row points at.
5. **`product/plans/complete/pdf-tab-find.md`** — in the `usePdfFind.ts` bullet, say `current` keeps its identity while its page, line, and start are unchanged, so a page read is not a repaint trigger; in the `usePdfFind.test.ts` and `PdfTab.test.tsx` test bullets, name the two new cases.
6. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- `web/src/plugins/pdf/usePdfFind.test.ts`, "keeps current while a page read leaves the highlighted occurrence in place": with `deferredPdf(3)`, open, set the query `needle`, resolve page 1 with `needle haystack`, and capture `result.current.current`, which is `{ page: 0, line: 0, start: 0 }`. Resolve page 2 with `hay`; `current` is the same object (`toBe`). Resolve page 3 with `needle`, which `contiguousMatch` ranks first because it scores the same and is shorter; `current` is a new object equal to `{ page: 2, line: 0, start: 0 }`. Before the fix, the second assertion fails because the page-2 read produced a new object.
- `web/src/plugins/pdf/PdfTab.test.tsx`, "keeps the painted marks while another page's text is read": a three-page `markedDocument` with `needle here`, `hay`, and `hay`, whose `readPageText` answers page 0 at once and holds pages 1 and 2 on deferreds. Open find, type `needle`, show page 0, wait for one match-or-current range, and capture the ranges. Resolve page 1's read and then page 2's; after each, the painted ranges are the same `Range` objects. Before the fix, each read deleted and repainted them as new objects.
- Existing `usePdfFind`, `usePdfFindMarks`, and `PdfTab find marks` cases cover current-mark movement on a changed row, query, or text-layer counter, and stay green.

## Out of scope

- `web/src/plugins/pdf/usePdfFindMarks.ts` and `web/src/plugins/pdf/PdfTab.tsx`, which need no change once `current` is stable.
- Repainting only the layer that changed when the text-layer counter bumps or the query changes. The canonical plan records that as the upgrade if typing ever lags, and this fix leaves it there.
- `web/src/shared/line-find/useLineFind.ts`, whose `results` identity is shared with the editor and shell overlays.
- Help and user documentation: nothing documented changes.
- The pull request description, which the entry does not ask to change.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- `gh pr view 1958 --json state,headRefName,headRefOid` shows `OPEN` on `feature/pdf-tab-find` at the pushed commit.
