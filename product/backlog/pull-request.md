# pull-request

* Handle the functionality gap where closing a PDF tab leaves an in-flight document load running.

Existing Issue: `usePdfDocument` only destroys a PDF after `loadPdf` resolves, so unmounting a tab while PDF.js is still fetching or parsing it leaves its loading task and worker active until the operation happens to finish. Severity: 5/10

Existing Risk: 5/10 - Closing large, slow, or unreachable PDFs can retain network activity, worker work, and memory after the tab and its registered file have gone away, with repeated opens making the waste accumulate.

Proposal Risk: 2/10 - Cancelling a load during teardown could race its completion, but keeping one explicit cancellation path and retaining the existing late-result cleanup makes the tab's ownership boundary clear.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1076: cancel in-flight PDF loads when a tab closes". Refactor `web/src/plugins/pdf/pdf-document.ts` and `web/src/plugins/pdf/usePdfDocument.ts` so the hook can cancel PDF.js's loading task during effect cleanup even when `task.promise` has not resolved; retain destruction of a loaded document and ensure a cancelled result cannot update state or send a failure intent. Extend `web/src/plugins/pdf/usePdfDocument.test.ts` with a controlled pending load that is unmounted before resolution and verifies that cancellation occurs, while preserving the existing late-success cleanup and one-report-per-tab behavior.


* Correct the pull request description's render-failure guarantee by showing a failed PDF tab when a page cannot render.

Existing Issue: `web/src/plugins/pdf/PdfPage.tsx` catches and discards every `renderPage` rejection, so a PDF that loads but whose visible page or text layer cannot render remains in the ready state with a blank placeholder rather than the promised `Failed to load <name>` body and notification. Severity: 6/10

Existing Risk: 5/10 - A user opening a partially corrupt or unsupported document receives no explanation and cannot distinguish a slow render from a permanently unusable document, contrary to the pull request's documented error path.

Proposal Risk: 2/10 - Render cancellation is an expected consequence of changing scale or closing a page, so the failure path must distinguish it from a real PDF.js rendering error to avoid false notifications.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1076: surface PDF page rendering failures". In `web/src/plugins/pdf/pdf-document.ts`, `web/src/plugins/pdf/PdfPage.tsx`, `web/src/plugins/pdf/PdfStage.tsx`, and `web/src/plugins/pdf/PdfTab.tsx`, propagate genuine stage-page rendering or text-layer failures to the tab's existing failed presentation and emit the closed-set `other` failure intent exactly once; continue treating PDF.js render cancellation as non-fatal and do not make thumbnail-only work a spurious tab failure. Add focused cases to `web/src/plugins/pdf/PdfTab.test.tsx` and, where the one-time notification logic is shared, `web/src/plugins/pdf/usePdfDocument.test.ts`, asserting the failed body, retained metadata, one intent, and no report for cancellation.


* Remove the technical documentation debt that says only the video external viewer is read after the PDF plugin adds another reader.

Existing Issue: `product/specs/application-config.md` still states that only `externalViewers.video` is read, while the existing audio plugin and this pull request's PDF opener both read their plugin-keyed entries. Severity: 3/10

Existing Risk: 3/10 - Users and maintainers can conclude that `externalViewers.pdf` is ignored and lose the configured PDF hand-off behavior the new plugin documents elsewhere.

Proposal Risk: 1/10 - The documentation can still drift if a future plugin consumes another entry, but accurately describing the current plugin-keyed readers removes the false exclusivity without changing configuration behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1076: document the PDF external viewer configuration". Update the `externalViewers` row in `product/specs/application-config.md` to retain its default and fallback semantics while naming the current video, audio, and PDF readers (or otherwise describing the plugin-keyed contract without claiming only video). Cross-check the wording against `src/plugins/context.ts`, `src/plugins/audio/activate.ts`, `src/plugins/pdf/activate.ts`, and the configured-viewer sections already added to `product/specs/open.md`; no runtime configuration behavior should change. Add or update a documentation/specification assertion only if the repository already has a colocated test that pins this setting's documented readers.
