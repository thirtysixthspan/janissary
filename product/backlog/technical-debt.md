# technical-debt

## ready

## development

* Extract PDF stage measurement and visible-page tracking into a hook beside the stage component.

Existing Debt: The PDF stage violates §5 (components render; they do not decide) and §6 (hooks are the seam between logic and view) by keeping resize subscription, intersection-ratio ranking, and token-driven scroll synchronization inside the component that renders the pages. Severity: 5/10

Existing Risk: 4/10 - A change to viewport tracking must navigate rendering and observer lifecycle together, making it easier to desynchronize the current-page readout and thumbnail highlight or repeatedly rerender pages on unchanged measurements.

Proposal Risk: 2/10 - The tracking has a dedicated hook and existing render-level regression coverage, but equal intersection ratios and observer callback timing still depend on browser behavior that the current stubs only approximate.

Proposal: Extract the three effects and measured-size state from `web/src/plugins/pdf/PdfStage.tsx` into a new `web/src/plugins/pdf/usePdfStageViewport.ts` hook that receives the stage ref, layout, page count, jump record, and visible-page callback, and returns the measured size. Keep the layout effect's duplicate-size suppression, the continuous-layout observer gate, its accumulated ratio map and first-best tie behavior, observer disconnection, and the jump token dependency unchanged. The hook can declare its small structural jump input locally so it never imports the component; preserve the existing `PdfJump` and `PdfStageProperties` exports in `web/src/plugins/pdf/PdfStage.tsx`. The component should call the hook and retain page JSX, padded box calculation, and calls to the existing pure `fitScale` helper in `web/src/plugins/pdf/pdf-view-model.ts`. Only `web/src/plugins/pdf/PdfTab.tsx` imports the stage, and its import and props stay unchanged. `web/src/plugins/pdf/PdfTab.test.tsx` already drives resize and intersection observers, checks duplicate-size suppression and resize cleanup, and verifies current-page and thumbnail selection; it mocks the PDF loader rather than stage internals, so it needs no edit and must keep passing. This increment changes one existing source file and adds one hook without changing PDF loading or page rendering. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/plugins/pdf/PdfStage.tsx`.

* Reduce the cognitive complexity of `applyReplayProtocol()` in `src/file-navigator/replay-protocol.ts` (line 35), reported at 18 against the allowed 15 in a file scoring 46.06 FTA across 73 lines. The function runs one replay pass over clipboard/undo steps and folds three concerns inline — conflict detection against preflight, a per-item apply loop gated on the conflict policy, and stack reconciliation that re-pushes remaining steps onto the from-stack — each nesting conditionals inside the shared loop, so lifting the conflict collection or the stack reconciliation into a local helper brings the tangle down without touching exports. The file is a quiet corner (one commit in six months), so nothing is on fire. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `applyReplayProtocol()` in `src/file-navigator/replay-protocol.ts`. Severity: **low**.

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
