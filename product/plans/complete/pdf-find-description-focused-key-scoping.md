# Describe the focused-tab PDF key scoping in the find pull request

**Complexity: 2/10** — a pull-request description correction only, with no code, test, spec, or help changes. The behavior already ships and is pinned by component tests; the care is in placing one What paragraph and one verification paragraph without disturbing any other text or renumbering the cases.

## Goal

The pull request body explains that the `meta+f` chord reaches a PDF tab only while it is the current centre tab or a docked tab with focus inside it. It never says that the PDF view's own keys follow the same rule. The arrows, Page Up and Page Down, Ctrl/Cmd+wheel, and Escape now belong to one PDF tab at a time, and a docked PDF tab takes them only once its page is clicked. How-to-verify Step 12 and the closing note cover find and marks across two PDF tabs, but no step checks that Escape and the page keys reach only the focused one. A reviewer who works only the single-tab path can miss a two-tab routing regression, and a reader can't tell the scoping is intended.

The behavior is implemented and covered:

- `web/src/plugins/pdf/usePdfKeyOwnership.ts` answers true for a centre tab while it is active and focus is inside it or in no labelled tab, and for a docked tab only while it is active and focus is inside its own `.pdf-tab`.
- `web/src/plugins/pdf/PdfTab.tsx` passes that answer to `usePdfKeys`, which gates the window `keydown` listener (arrows, Page keys, Escape closing the overlay or resetting zoom) and the stage's Ctrl/Cmd+wheel listener on it. It also passes `focusable` to `PdfStage` for a docked tab.
- `web/src/plugins/pdf/PdfStage.tsx` gives a focusable stage `tabIndex={0}` and focuses it on pointer down, so clicking a docked page puts focus inside the tab. A centre stage is not focusable, so clicking it leaves focus in no tab and the centre tab keeps the keys.
- `web/src/plugins/pdf/PdfTab.test.tsx`, `a centre and a docked PdfTab`, pins it: Escape on the page body closes only the centre overlay and leaves the docked marks; Escape after clicking the docked stage closes only the docked overlay and leaves the centre marks; Arrow Down on the body pages only the centre tab, and Page Down after clicking the docked stage pages only the docked tab.

`product/specs/pdf-tab.md` § Zoom and keys and § Find already state the rule, and `documentation/user-documentation/tab-types/pdf-viewer.md` already says a docked PDF tab takes the keys once you click into it. The description is the only artifact that needs correcting.

## Approach

Change only the pull request body, and apply it only after the commit is pushed.

In the What section, add one new paragraph directly after the paragraph that describes the chord (the one beginning "Match marks use CSS Custom Highlight ranges"). It says the PDF view's arrows, Page keys, Ctrl/Cmd+wheel, and Escape follow the focused PDF tab: a centre PDF tab while it is current and focus isn't inside another tab, and a docked PDF tab only while focus is inside it, with a click on its page putting focus there. So neither of two open PDF tabs pages the other, resets its zoom, or closes its find overlay.

In How to verify, extend Step 12 with a third paragraph rather than adding a new numbered case, so cases 13 through 32 keep their numbers. It docks the forty-page fixture beside the centre three-page fixture, opens find in both with queries that land on a known page (`delta` on page 2 of the centre document, `page 5` on page 5 of the docked one), then clicks the docked page and presses Escape, Down, and Page Down, and repeats from the centre page. Only the focused overlay closes and only the focused readout moves. The paragraph names the `PdfTab.test.tsx` centre-and-docked cases as the automated pin.

The queries are chosen so each readout is predictable. A query with several rows lands on whichever page the best-ranked row sits on, which the reviewer can't predict, and a centre page already on the last page would hide whether Down moved it.

Every other paragraph, heading, the closing note, and the title stay exactly as written. No change-set statistics or commit SHAs are added. The resolved backlog entry is removed, and because it is the only one, the file is restored to the comment-and-heading skeleton.

## Implementation steps

1. Write this plan and promote it to `ready/`, then to `complete/` once the description text is settled.
2. Remove the resolved entry from `./product/backlog/pull-request.md`, restoring the exact master skeleton.
3. Commit and push to `feature/pdf-tab-find`.
4. After the push, read the live body with `gh pr view 1958 --json body` and write the full revised body to `./temp/pr-body.md`, inserting the new What paragraph after the chord paragraph and the new paragraph at the end of Step 12.
5. Compare the revised body with the original to confirm only the two inserted paragraphs differ.
6. Apply it with `gh pr edit 1958 --body-file ./temp/pr-body.md`, and confirm the PR is still open with its head at the pushed commit.

## Tests

No automated test changes. The behavior is pinned by the three `a centre and a docked PdfTab` cases in `web/src/plugins/pdf/PdfTab.test.tsx`, and they must stay green.

Verification runs:

- `$janissary/scripts/run.mjs check-diff`
- `npm run test:client -- web/src/plugins/pdf/PdfTab.test.tsx -t "a centre and a docked PdfTab"`

## Out of scope

- Any code change in `usePdfKeyOwnership.ts`, `usePdfKeys.ts`, `PdfTab.tsx`, or `PdfStage.tsx`; the scoping is implemented and tested.
- Any spec, help, or user-documentation change: all three already describe the rule.
- Renumbering the How-to-verify cases or rewriting Step 12's existing paragraphs and the closing note.
- The pull request title and every unrelated description paragraph.

## Verification

- `$janissary/scripts/run.mjs check-diff` passes.
- The centre-and-docked `PdfTab` cases pass.
- `gh pr view 1958 --json state,headRefName,headRefOid` shows the PR `OPEN` on `feature/pdf-tab-find` at the pushed commit.
- The live body contains the new What paragraph and the new Step 12 paragraph, with every other paragraph unchanged and no change-set statistics or SHAs.
