# Describe the find render-failure close and early-Down guard

**Complexity: 3/10** — a pull-request description correction only, with no code, test, spec, or help changes. Both behaviors already exist and are pinned by client tests; the care is in placing the two sentences and the two verification cases without disturbing any other paragraph.

## Goal

The pull request body's What section describes text-read failure and row selection, but it never says that a page render failure closes an open find overlay and clears its marks, nor that pressing Down before any result arrives leaves the first row selected. A reader of the description cannot learn or verify either behavior, even though both are promised by the branch's completed fix plans and pinned by tests.

The behaviors are already implemented and covered:

- `web/src/plugins/pdf/PdfTab.test.tsx`, `PdfTab failure` — "closes the find overlay and clears its marks when a render fails": after find has painted one match and one current mark on a drawn page, a rejected `renderPage` for the next page renders `Failed to load paper.pdf`, removes the `Search document` input, and empties both highlight sets.
- `web/src/plugins/pdf/usePdfFind.test.ts`, `usePdfFind revealing` — "keeps the first result selected when Down arrives before any result": with a deferred page read, `select(-1)` leaves `selected` at `0` and `current` at the first match once the page resolves.

`product/specs/pdf-tab.md` § Find already states both rules, so the description is the only artifact that needs correcting.

## Approach

Change only the pull request body, and apply it only after the commit is pushed. The What section gains one sentence after the text-read failure paragraph and one after the Return sentence. The How-to-verify Edge cases section gains two numbered cases, continuing from 30.

The render-failure case is a component-test step rather than a manual app step, because a fixture cannot make `renderPage` reject on demand; the case names the existing test and checks the same three outcomes. The early-Down case is manual: reopen the long fixture so reading restarts, type while the read is unfinished, press Down before any row exists, then finish reading and confirm the first row and its occurrence are selected and marked.

Every other paragraph, heading, and the title stay exactly as written. No change-set statistics or commit SHAs are added.

## Implementation steps

1. After the push, read the live body with `gh pr view 1958 --json body` and save it to `./temp/pr-body.md` so the author's text is preserved byte-for-byte.
2. In the What section, append after "A page whose text cannot be read contributes no lines and sends no notification, matching how a thumbnail that fails to draw does not fail the document.": "A page render failure is different: it fails the document, which closes an open find overlay and clears its marks."
3. In the What section, append after "Return goes to the first ranked match and the overlay stays open.": "Pressing Down before any result has arrived keeps the first row selected, so its occurrence is a current mark as soon as results arrive."
4. In How to verify → Edge cases, add case 31, "Page render failure closes find": run `npm run test:client -- web/src/plugins/pdf/PdfTab.test.tsx -t "closes the find overlay and clears its marks when a render fails"`, which opens a marked two-page document in continuous scroll, types `needle`, draws page 1 so one match and one current mark are painted, then rejects page 2's `renderPage` with a plain `Error`. Expect `Failed to load paper.pdf`, no `Search document` input, and both the match and current highlight sets empty.
5. Add case 32, "Down before results arrive": on `pdf-find-long.pdf`, reopen the tab so its forty pages are read again, press `Cmd+F`, type `filler` while `Reading pages…` still shows and no row exists, press `Down`, then wait for reading to finish. Expect the first row selected and its occurrence the current mark, on page 1.
6. Apply the body with `gh pr edit 1958 --body-file ./temp/pr-body.md`, then compare it with the saved original to confirm only the intended additions changed and the title is untouched.

## Tests

No automated test changes. The behavior is already pinned by the two existing cases named above, and both must stay green under `$janissary/scripts/run.mjs check-diff`.

Verification runs:

- `$janissary/scripts/run.mjs check-diff`
- `npm run test:client -- web/src/plugins/pdf/PdfTab.test.tsx web/src/plugins/pdf/usePdfFind.test.ts`

## Out of scope

- Any code change in `PdfTab.tsx`, `usePdfFind.ts`, `LineFind.tsx`, or the mark painter; both behaviors are implemented and tested.
- Any spec change: `product/specs/pdf-tab.md` § Find already states the render-failure close and the early-Down selection rule.
- Help and user documentation: neither describes these edge cases.
- The pull request title and every unrelated description paragraph.
- The other entry in `product/backlog/pull-request.md`.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes.
- The focused PDF tests pass.
- `gh pr view 1958 --json state,headRefName,headRefOid` shows the PR `OPEN` on `feature/pdf-tab-find` at the pushed commit.
- The live body contains both new What sentences and both How-to-verify cases, with every other paragraph unchanged and no change-set statistics or SHAs.
