<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's best-effort text-read behavior in the PDF user guide.

Existing Issue: The PDF guide says a page whose text does not come through fails the document, while Find skips a page whose text read rejects and continues without notification, leaving the two text-failure cases unclear to readers. Severity: 3/10

Existing Risk: 3/10 - A reader may mistake incomplete search results for a failed document or expect a notification that Find does not send.

Proposal Risk: 1/10 - The guide distinguishes a selectable text-layer render failure from a Find text-read failure that only omits that page, while the existing rejected-page test continues to pin the implementation.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1958 "clarify PDF Find text-read failures in the user guide". Update `documentation/user-documentation/tab-types/pdf-viewer.md`: in `When a PDF won't open`, clarify that the page text failure described there is a selectable text-layer render failure; under `Finding text`, state that if Find cannot read one page's text, it skips that page and continues searching the rest without a notification. Keep the distinction aligned with `product/specs/pdf-tab.md`. `web/src/plugins/pdf/usePdfFind.test.ts` already covers a rejected page being skipped while later pages still contribute, so preserve that behavior and use the test as the implementation reference.
