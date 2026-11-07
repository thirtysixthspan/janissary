# State the active-tab rule for PDF find marks

**Complexity: 3/10** — three markdown artifacts change and no code does; the care is in replacing a split-pane promise with the host's actual active-tab rule everywhere it is asserted, while leaving the author's other paragraphs byte-for-byte intact.

## Goal

`product/plans/complete/pdf-tab-find.md` § Match highlighting promises that two PDF tabs in a split share the highlight names but keep their own ranges, so each marks only its own document and closing one leaves the other's marks in place. The pull request's verification Step 12 asks a reader to prove that, and its closing note says the check needs two PDF tabs in a split. The host cannot produce that state.

`PluginTabLayer` passes `active` only to the current centre tab (`isVisible && tab.label === current?.label`). `usePdfFind` hands that flag to `useLineFind`, whose effect closes the overlay when `active` goes false, and a closed overlay clears the marks through `usePdfFindMarks`. So a split's other PDF pane is visible but not active: it cannot open find while the first pane's tab is the current one, and making it active closes the first tab's overlay and clears its marks.

`DockedPluginBody` is different: it passes `active={isVisible}`, so a PDF tab shown in a sidebar is active whenever its sidebar shows it and can hold an open overlay beside a centre PDF tab. The existing `paintMarks` case in `web/src/plugins/pdf/pdf-find-marks.test.ts` proves another painter's ranges survive one painter's cleanup.

The repair is documentation only: correct the plan, the pull request's Step 12 and closing note, and the PDF spec's § Find so they state the rule the code already implements. No production code or test changes.

## Approach

The plan and the spec both use "visible" where the host and the find hook use "active". A normal tab is both, so the difference never shows until a split puts two centre panes on screen at once, and then only one of them is active. The correction names the active tab as the gating condition and spells out what that means in a split, so a reader cannot expect the non-active pane to answer `Cmd+F` or to keep marks.

The docked case stays separate because it is genuinely different: a visible docked PDF tab is active for the plugin body even though it is never the application's active tab. State that exception wherever the corrected text could otherwise imply that only one PDF tab in the whole window can hold an overlay.

## Implementation steps

1. **Plan § Match highlighting.** Replace the bullet beginning "Two PDF tabs in a split share the highlight names…" with the actual rule: the overlay is available only in the tab the host reports active, `PluginTabLayer` gives `active` only to the current centre tab, so a split's other pane is visible but not active, cannot open find while the first is active, and its marks clear when the first stops being active. Keep the docked exception: `DockedPluginBody` passes `active={isVisible}`, so a tab shown in a sidebar can hold an overlay beside a centre PDF tab, and each marks only its own document.

2. **Plan § Proposed changes, the `pdf-find-marks.ts` bullet.** Replace the closing sentence "so two PDF tabs in a split each keep their own marks" with wording that does not claim split behaviour: two PDF tabs with open overlays each keep their own marks.

3. **Plan design decisions, reuse table, and keyboard section.** Replace "visible" with "active" where the chord claim, the tab close, and the chord routing are described, and say in the first design decision that active means the current centre tab or a PDF tab shown in a sidebar. These are the sentences that let a reader carry the visible/active confusion into a split.

4. **`product/specs/pdf-tab.md` § Find.** Change the opening paragraph's "while the PDF tab is the visible one" and the loading paragraph's "While the PDF tab is visible" to the active tab, naming the two cases: the current centre tab, or a PDF tab shown in a sidebar while focus is inside it. Change the Escape paragraph's "stopped being visible" to "stopped being active". Add to the last paragraph that a split's non-active PDF pane does not answer `Cmd+F` and that its marks clear when it stops being active, and that a visible docked PDF tab can hold an overlay beside a centre one.

5. **Pull request description, after the push.** Rewrite verification Step 12 so it tests the rule rather than the impossible state: the active tab answers, the split's other pane does not, and making it active closes the first tab's overlay and clears its marks. Offer the two-overlay check with one PDF tab docked into a sidebar and one in the centre. Change the closing note's split requirement to the docked arrangement and note that the existing `paintMarks` case covers another painter's ranges surviving cleanup. Preserve every other paragraph exactly.

6. **Sweep for the old claim.** Confirm no remaining sentence in the plan, the spec, or the verification steps says both split panes keep marks or that a split's non-active pane can open find.

## Tests

No new tests. The repair changes only the plan, the spec, and the pull request body; the entry explicitly rules out production code and test changes, and the behaviour being documented is already covered by `web/src/plugins/pdf/pdf-find-marks.test.ts` ("leaves another painter's ranges and the registered highlight alone") and by the existing `usePdfFind`/`PdfTab` active-tab tests. `$janissary/scripts/run.mjs check-diff` is the verification and is expected to stay clean.

## Out of scope

- Changing `PluginTabLayer.tsx`, `DockedPluginBody.tsx`, `PdfTab.tsx`, `usePdfFind.ts`, `usePdfFindMarks.ts`, or any other production code.
- Changing `useLineFind` or the plugin `active` contract so a split's non-active pane keeps answering `Cmd+F`. The active-tab rule is the design.
- Adding a regression test for a behaviour the code already has and the existing tests already isolate.
- Updating help or user documentation: no documented behaviour changes, and the PDF user page never claims split-tab marks.
- The other entries in `product/backlog/pull-request.md`.

## Verification

- `$janissary/scripts/run.mjs check-diff` — no code changes, expected clean.
- Read the plan's § Match highlighting and the spec's § Find and confirm neither retains "two PDF tabs in a split" or "visible" where active is meant.
- After the push, diff the revised pull request body against the original and confirm only Step 12 and the closing note changed.
- `gh pr view 1958 --json state,headRefName,headRefOid` shows `OPEN` on `feature/pdf-tab-find` at the pushed commit.
