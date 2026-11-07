<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description by documenting the focused-tab PDF key and Escape scoping and adding a two-tab verification step.

Existing Issue: The pull request body's What section and How-to-verify never say that the PDF's arrows, Page keys, Ctrl/Cmd+wheel, and Escape follow the focused PDF tab, or that a docked PDF becomes key-owning when its page is clicked; Step 12 and the closing note cover only find and marks across two PDFs. Severity: 3/10

Existing Risk: 3/10 - A reviewer works only the single-tab happy path and misses a regression in two-PDF key routing, and a reader cannot tell whether the new scoping is intended.

Proposal Risk: 1/10 - Description-only; the shipped behavior and its tests do not change.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "describe the focused-tab PDF key and Escape scoping and add a two-tab verification step". In the What section, add one sentence after the paragraph that describes the chord: page, zoom, and Escape keys belong to the focused PDF tab (a centre PDF while it is current and focus is outside another tab, a docked PDF while focus is inside its own body), and clicking a docked page puts focus there so two PDF tabs do not page or close each other. In How to verify, extend the two-PDF case (Step 12) or add a case beside it: open a centre and a docked PDF, open find in both, click the docked page, press Escape and then the arrow and Page keys, and confirm only the docked overlay closes and only the docked page moves; then click the centre page and repeat; name `PdfTab.test.tsx`'s centre-and-docked cases as the automated pin. Change no code, spec, plan, or title, and preserve every other paragraph byte-for-byte.
