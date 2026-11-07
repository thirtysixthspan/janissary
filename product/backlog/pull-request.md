<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's cross-links from the PDF Find spec to the editor and shell specs.

Existing Issue: The new PDF Find section says the overlay is the same one the editor and shell tabs use but carries no `[[editor-tab]]` or `[[shell-tab]]` link, although the subplan's design decisions require both. Severity: 3/10

Existing Risk: 3/10 - A reader of the PDF spec cannot follow the shared-overlay contract to the specs that own it, so a later change to the editor or shell find can land without the PDF section being checked or updated.

Proposal Risk: 1/10 - The change is text-only and both target specs exist, so the only residual risk is a mistyped wiki link, which a reader or a spec-link check would surface.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "add the editor and shell spec cross-links to the PDF Find section". In product/specs/pdf-tab.md § Find, first paragraph, change "It is the same overlay the editor and shell tabs use" to name the owning specs with wiki links, for example "It is the same overlay the editor (see [[editor-tab]]) and shell (see [[shell-tab]]) tabs use". Keep the rest of the section byte-for-byte and change no code. The targets are product/specs/editor-tab.md § Finding a line and product/specs/shell-tab.md § Transcript search, and the PDF spec already uses [[tab-plugins]], [[profiles]], and [[notifications]], so the syntax is established. No prose test covers this and no source changes are needed; $janissary/scripts/run.mjs check-diff should stay clean, and any spec-link check should resolve both names.


* Correct the PDF Find spec's focus-restore claim to match the code's another-text-field exception.

Existing Issue: The PDF Find spec says closing the overlay returns focus to the element that had it before `Cmd+F` was pressed whenever that element is still in the document, while usePdfFind.close deliberately skips the restore when another text-entry element holds focus, as its own test pins. Severity: 2/10

Existing Risk: 2/10 - A reader can expect focus to leave a field they are typing in, and a later change may follow the spec's absolute wording instead of the code's guard, though the normal page-focus path is unaffected.

Proposal Risk: 1/10 - The exception makes the spec match the code; the only residual risk is documenting an edge case that is hard to reach, which changes no behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "document the PDF Find focus-restore exception for another text field". In product/specs/pdf-tab.md § Find, in the paragraph beginning "Escape closes the overlay...", change "Closing the overlay returns focus to the element that had it before `Cmd+F` was pressed, if that element is still in the document." to add the code's second condition, for example "Closing the overlay returns focus to the element that had it before `Cmd+F` was pressed, if that element is still in the document and another text field has not taken focus." The rule is in web/src/plugins/pdf/usePdfFind.ts close() and is pinned by the "leaves focus in another text field" case in web/src/plugins/pdf/usePdfFind.test.ts. Keep the user doc's "usually the page" wording, which already allows the exception. No behavior or code change; $janissary/scripts/run.mjs check-diff should stay clean.
