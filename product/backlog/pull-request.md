<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Scope the PDF tab's global keys and find-overlay close to the focused PDF tab so a docked tab cannot close another tab's overlay or page another document.

Existing Issue: `usePdfKeys` attaches a window keydown listener whenever `capabilities.active` is true, and a docked PDF tab is active whenever its sidebar shows it, so the supported centre-plus-docked two-overlay state has two live listeners: with both overlays open an Escape on the centre page closes both, and Arrow and Page keys page both documents even though the description and spec say closing one leaves the other's overlay and marks in place. Severity: 5/10

Existing Risk: 5/10 - A user with a PDF docked beside a centre PDF presses Escape or an arrow in the focused tab and the other tab's overlay closes, its marks change, or focus is restored into the docked tab, all during ordinary use of the PR's own docked verification step.

Proposal Risk: 3/10 - Routing keys by the same focus ownership the chords already use removes the cross-tab effect, but it changes when a docked tab's keys work and needs a focusable docked stage plus component coverage; a centre tab's keys must stay as they are.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "scope PDF key handling and overlay Escape to the focused PDF tab". Route the PDF key listener by the same focused-tab ownership the chords use, or compute an `ownsKeys` flag in `PdfTab` from a tab root ref: a centre PDF tab owns keys while it is the current one and focus is not inside another plugin tab, and a docked tab owns them only while `document.activeElement` is inside its `.pdf-tab`. Give the docked stage `tabIndex={0}` (or focus the stage on pointerdown) so clicking a docked page puts focus inside it; otherwise the focused-only rule makes its keys unreachable. Pass `ownsKeys` instead of `capabilities.active && loaded !== null` to `usePdfKeys`, and keep the overlay close callback gated by the same flag; the chord claim can stay as it is because `chordTabLabel` in `web/src/useWindowKeys.ts` already routes by focus. Add a component test in `web/src/plugins/pdf/PdfTab.test.tsx` (or `web/src/plugins/DockedPluginBody.test.tsx`) with a docked PDF and a centre PDF: open both overlays, focus the centre page, press Escape, and assert only the centre closes and the docked `pdf-find-*` ranges remain; then focus the docked stage or input, press Escape, and assert the docked overlay closes and the centre's marks remain; also assert Arrow and Page keys change only the focused tab's page. Keep the existing `usePdfKeys` hidden-tab case, `PdfTab` active-false case, and find-mark tests passing; update `product/specs/pdf-tab.md` § Find only if the key-ownership wording needs the docked focus case.


* Deliver the active-tab repair's promise by stating the focus condition for the chord in the spec's loading paragraph, the plan's design decisions, and the manifest comment.

Existing Issue: The active-tab fix plan says the plan and spec should state the rule the code implements — a current centre tab or a sidebar tab with focus inside it — but `product/specs/pdf-tab.md`'s loading paragraph still says Cmd+F is answered while the tab is active, `product/plans/complete/pdf-tab-find.md`'s first design decision and claim bullet treat active or visible as sufficient, and `src/plugins/pdf/manifest.ts`'s comment says the chord is honoured only while visible and taken back the moment focus moves; chord routing actually matches the focused tab label, so a docked visible tab with focus elsewhere does not answer and stays claimed while its sidebar shows it. Severity: 4/10

Existing Risk: 4/10 - The exact visible-versus-active confusion the repair exists to remove survives in the loading paragraph, the plan, and the server comment, so a later test or doc can assert that an unfocused docked tab answers Cmd+F and route a user's chord to the wrong find.

Proposal Risk: 1/10 - The prose and comment then match the opening and last paragraphs of § Find and the existing `chordTabLabel` and `usePluginChordClaims` behavior; no code or test changes and the spec's correct lines are the source of truth.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "state the focus condition for the PDF find chord in the spec, plan, manifest comment, and description". In `product/specs/pdf-tab.md` § Find, qualify the loading paragraph the same way the opening paragraph does: Cmd+F is answered while the tab is active and the chord reaches it — the current centre tab, or a sidebar tab with focus inside it; keep the loading, failure, and overlay-clear sentences. In `product/plans/complete/pdf-tab-find.md`, amend the first design decision and the "claim is registered whenever the tab is active" bullet so that active describes overlay availability while chord answering follows focus, and say the docked tab stays claimed while visible but only the focused label runs it. In `src/plugins/pdf/manifest.ts`, replace "visible one" with "active one" and replace "takes it back the moment focus moves" with the actual release rule (a centre claim moves with the current tab; a docked claim lasts while its sidebar shows it), and correct the last sentence so a handler that no-ops while loading or failed still consumes the chord. Update the pull request body's "chord belongs ... only while that tab is visible" sentence to the same active and focus wording. Do not change code or tests; `web/src/useWindowKeys.ts` `chordTabLabel` and `web/src/plugins/PluginChords.tsx` are the behavior, and the existing `PdfTab.test.tsx` active-false case and `PluginChords` tests must keep passing.


* Correct the description's verification step that tells the reader to press Up to reach the row labelled 3, which the ranked row order can never do.

Existing Issue: How to verify Step 3 says to press Up until the row labelled 3 is highlighted, but the three rows rank 2, 3, 1 by line length, selection starts on row 2, and the shared ranked-key handler clamps ArrowUp at zero rather than wrapping, so Up leaves the selection on row 2 and page 3 never becomes shown. Severity: 4/10

Existing Risk: 4/10 - A reviewer following the step sees no page change and may report the reveal or the shared key handler as broken, while the actual defect is a verification recipe that cannot be performed.

Proposal Risk: 1/10 - The recipe then matches the documented Down behavior and the code's row order; the feature behavior itself is untouched, and the ranking is already pinned by the results tests.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "correct the Up direction in verification Step 3". In the pull request body's Step 3, change "press `Up` until the row labelled `3` is highlighted" to "press `Down` until the row labelled `3` is highlighted" (or "press Down once from the first row"). The rows for `quick brown fox` rank page 2, page 3, page 1 because `contiguousMatch` tie-breaks equal scores by line length, selection starts at the first row, and `rankedOverlayKeys` clamps ArrowUp at zero rather than wrapping; Step 9 already uses Down for the same third row. No code or test change: `web/src/plugins/pdf/PdfTab.test.tsx` covers arrow movement and the ranking is fixed by `web/src/shared/fuzzy-match.ts`. Keep the expected page 3, readout 3/3, and thumbnail wording.


* Correct the description's reading-status verification step, which reopens a tab whose text was already read and so can never show the Reading pages status.

Existing Issue: Step 16 opens `pdf-find-long.pdf` and expects `Reading pages…` before the forty-page read finishes, but Step 11 already opened that same tab, typed `filler`, and started the one-per-tab read, so reopening the document focuses the existing tab and `usePdfFind`'s started ref skips the read entirely. Severity: 4/10

Existing Risk: 4/10 - A reviewer following the sequence waits for a status that cannot appear and may conclude the reading indicator is broken or untested, while the actual issue is the step's starting state.

Proposal Risk: 1/10 - The recipe then exercises the first-open read path the code and `PdfTab.test.tsx` already cover, with no product behavior changed and no new flakiness beyond the read timing the step is about.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "fix the reading-status verification step to use a fresh tab". In the pull request body's Step 16, make the tab fresh before checking: close the `pdf-find-long.pdf` tab and reopen it (or use a long document not yet searched) so the one-per-tab read starts on the Cmd+F that the step observes. Then type `filler` before the forty-page read finishes and keep the existing expected states. This matches `usePdfFind`'s `started` ref and the first-open read; `web/src/plugins/pdf/PdfTab.test.tsx`'s "shows the reading status until the last page is read" is the existing pin. No code or test change.


* Describe the render-failure close and the early-Down selection guard in the pull request body and add verification steps for both.

Existing Issue: The pull request body never mentions that a render failure closes an open find overlay and clears its marks, nor that pressing Down before any result keeps the first row selected; both behaviors are promised by the branch's fix plans and pinned by `PdfTab.test.tsx` and `usePdfFind.test.ts`, but a reader of the description cannot learn or verify either. Severity: 3/10

Existing Risk: 3/10 - A reviewer or future maintainer sees an undescribed error-path and edge-case behavior change, and a regression in either can ship without the description or manual verification catching it.

Proposal Risk: 1/10 - The description then covers the two repairs and their checks; the behaviors and tests already exist, so no code risk is added.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "describe the find render-failure close and early-Down guard in the pull request body". Add a sentence to the description's What section near the text-read failure paragraph saying that a render failure closes an open overlay and clears its marks, and a sentence or arrow note saying Down before results keeps the first row selected once results arrive. Add two How-to-verify cases: with a query and marks on a drawn page, force a page render failure (the rejected-`renderPage` pattern the component test uses) and confirm `Failed to load` appears, the `Search document` input is gone, and both highlight sets are empty; on a long document, type a query while reading is still unfinished, press Down before any row exists, then finish reading and confirm the first row is selected and its occurrence is the current mark. The existing pins are `PdfTab failure` "closes the find overlay and clears its marks when a render fails" in `web/src/plugins/pdf/PdfTab.test.tsx` and `usePdfFind revealing` "keeps the first result selected when Down arrives before any result" in `web/src/plugins/pdf/usePdfFind.test.ts`; do not record the behavior as a code change.


* Qualify the description's no-text and mark claims to non-whitespace queries, so they match the whitespace-only state the overlay actually shows.

Existing Issue: The description's no-text paragraph says a document with no text answers every query with `No matching lines`, and its marks paragraph says every occurrence is marked while the query is non-empty, but `LineFind` and `usePdfFindMarks` trim the query, so an empty or whitespace-only query shows `type to search` and paints no marks on every document, including a no-text one. Severity: 2/10

Existing Risk: 2/10 - A reader or future test can expect `No matching lines` for an empty or spaces-only query on a scanned PDF, contradicting the description's own Step 14 and the spec's non-whitespace wording.

Proposal Risk: 1/10 - The corrected wording matches the existing `LineFind` trim branch and `usePdfFindMarks`' trimmed-query guard, and no behavior or test changes.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "qualify the description's no-text and mark claims to non-whitespace queries". In the pull request body's no-text sentence, change "answers every query" to "answers every non-whitespace query"; in the marks paragraph, change "while the query is non-empty" to "while the query has non-whitespace text". The spec's `product/specs/pdf-tab.md` § Find and `product/plans/complete/pdf-tab-find.md` already say non-whitespace, `web/src/shared/line-find/LineFind.tsx` shows `type to search` when `!query.trim()`, and `web/src/plugins/pdf/usePdfFindMarks.ts` returns before painting for a trimmed-empty query. The existing `LineFind` and `usePdfFindMarks` tests pin both states; no code change.
