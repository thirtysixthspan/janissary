<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's focused-tab key rule by correcting the completed plan and the PDF spec, which still describe the pre-repair behavior.

Existing Issue: The completed plan's design decisions and keyboard section say the PDF view's keys work whenever focus is outside the Find input, and its file-by-file changes, reuse table, and tests never mention `usePdfKeyOwnership.ts`, the focusable docked stage, or the centre-tab focus condition, while `product/specs/pdf-tab.md` § Zoom and keys credits the current centre tab with the keys without requiring focus outside another tab and § Find repeats the unqualified arrow/page-key sentence. Severity: 4/10

Existing Risk: 4/10 - A future implementation or review that follows the completed plan reintroduces the two-PDF key collision this repair fixed, and the spec cannot explain why a current centre PDF ignores keys while focus is in a docked shell, harness, or files sidebar.

Proposal Risk: 1/10 - The change is documentation-only; the code and its two-tab component tests stay as they are, so the only residual risk is wording drift.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "document the focused-tab PDF key-ownership rule in the completed plan and the PDF spec". In `product/plans/complete/pdf-tab-find.md`, rewrite the design decision that begins "The overlay owns its keys while focus is in its input" and the § Keyboard and accessibility paragraph so they say page, zoom, and Escape keys belong to the focused PDF tab: a centre PDF only while it is current and focus is not inside another labelled tab, a docked PDF only while focus is inside its own `.pdf-tab`. Add a § Proposed changes bullet for `web/src/plugins/pdf/usePdfKeyOwnership.ts` describing the focus snapshot, the `tabRef`/`ownsKeys` wiring in `PdfTab.tsx`, and the `focusable` prop on `PdfStage.tsx`; update the `PDF keys` row in § What already exists; and add the two-tab cases from the fix plan to the plan's test list and manual verification. In `product/specs/pdf-tab.md` § Zoom and keys, state the centre tab's focus condition beside the docked condition, and in § Find qualify "The arrow and page keys work on the document as usual while focus is outside the overlay" with the owning-tab condition or a cross-reference to § Zoom and keys. Keep the already-correct docked paragraph in § Find and the existing component tests unchanged; `web/src/plugins/pdf/PdfTab.test.tsx`'s centre-and-docked cases already pin the behavior.


* Correct the pull request description by documenting the focused-tab PDF key and Escape scoping and adding a two-tab verification step.

Existing Issue: The pull request body's What section and How-to-verify never say that the PDF's arrows, Page keys, Ctrl/Cmd+wheel, and Escape follow the focused PDF tab, or that a docked PDF becomes key-owning when its page is clicked; Step 12 and the closing note cover only find and marks across two PDFs. Severity: 3/10

Existing Risk: 3/10 - A reviewer works only the single-tab happy path and misses a regression in two-PDF key routing, and a reader cannot tell whether the new scoping is intended.

Proposal Risk: 1/10 - Description-only; the shipped behavior and its tests do not change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "describe the focused-tab PDF key and Escape scoping and add a two-tab verification step". In the What section, add one sentence after the paragraph that describes the chord: page, zoom, and Escape keys belong to the focused PDF tab (a centre PDF while it is current and focus is outside another tab, a docked PDF while focus is inside its own body), and clicking a docked page puts focus there so two PDF tabs do not page or close each other. In How to verify, extend the two-PDF case (Step 12) or add a case beside it: open a centre and a docked PDF, open find in both, click the docked page, press Escape and then the arrow and Page keys, and confirm only the docked overlay closes and only the docked page moves; then click the centre page and repeat; name `PdfTab.test.tsx`'s centre-and-docked cases as the automated pin. Change no code, spec, plan, or title, and preserve every other paragraph byte-for-byte.
