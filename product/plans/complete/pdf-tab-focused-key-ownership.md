# Scope PDF keys and find-overlay Escape to the focused PDF tab

**Complexity: 4/10** — one new focus-ownership hook, a small `PdfTab` wiring change, a focusable docked stage, and component coverage for two PDF tabs; the care is in preserving the centre tab's page-body behaviour while making a docked tab's keys reachable, without touching the chord claims.

## Goal

`usePdfKeys` attaches a window `keydown` listener whenever `capabilities.active` is true and the document is loaded. A centre PDF tab is active while it is the current tab, and a docked PDF tab is active whenever its sidebar shows it, so the supported centre-plus-docked arrangement has two live listeners at once. With both find overlays open, Escape pressed while focus is on a page closes both overlays, and Arrow or Page keys page both documents.

Key ownership must follow the focused tab, as chord routing already does: a centre PDF tab answers while it is the current tab and focus is not inside another tab, including when focus rests on the page itself; a docked PDF tab answers only while focus is inside its own `.pdf-tab`. The docked stage needs a focus target so clicking a docked page puts focus inside the tab, otherwise the focused-only rule leaves its keys unreachable.

## Approach

`web/src/plugins/pdf/usePdfKeyOwnership.ts` owns the rule. It watches `focusin` and `focusout` on the window and keeps two facts from `document.activeElement`: the label of the nearest enclosing `[data-tab-label]`, and whether the active element is inside this tab's own root. From those and the host's `active` flag:

- A docked tab owns keys only when `active` and focus is inside its own tab root.
- A centre tab owns keys when `active` and either focus is inside its own tab root or focus is in no tab at all. Focus in another labelled tab — another plugin tab, a harness tab, a files or notifications sidebar — belongs to that tab, not to the centre PDF.

`PdfTab` passes `ownsKeys && loaded !== null` to `usePdfKeys`, replacing `capabilities.active && loaded !== null`. The same `enabled` flag already gates the overlay close callback, so Escape only closes the owning tab's overlay. The chord claim is untouched: `chordTabLabel` in `web/src/useWindowKeys.ts` already routes a claimed chord to the focused tab label.

`PdfStage` gains an optional `focusable` prop. `PdfTab` sets it only for a docked tab (`capabilities.dock !== null`), so the docked stage gets `tabIndex={0}` and focuses itself on pointer down. The centre stage keeps today's markup and focus behaviour.

## Implementation steps

1. Add `web/src/plugins/pdf/usePdfKeyOwnership.ts` with the focus-tracking hook described above.
2. In `web/src/plugins/pdf/PdfTab.tsx`, add a ref to the `.pdf-tab` root, call the hook with `capabilities.active` and `capabilities.dock !== null`, pass its result to `usePdfKeys`, and pass `focusable={capabilities.dock !== null}` to `PdfStage`.
3. In `web/src/plugins/pdf/PdfStage.tsx`, render `tabIndex={0}` and an `onPointerDown` focus when `focusable` is true, leaving the stage unchanged otherwise.
4. Add the two-tab component cases to `web/src/plugins/pdf/PdfTab.test.tsx`: both overlays open with marks, Escape on the centre page body closes only the centre, Escape with focus in the docked stage closes only the docked tab, and Arrow/Page keys page only the focused tab.
5. Update `product/specs/pdf-tab.md` § Zoom and keys so the zoom and navigation controls say which tab owns them: the current centre tab, or a docked tab with focus inside it.
6. Update `documentation/user-documentation/tab-types/pdf-viewer.md`'s sentence about which tab the keys reach with the docked focus condition.
7. Run `$janissary/scripts/run.mjs check-diff` after each change and the focused PDF tests after the last one.

## Tests

- New cases in `web/src/plugins/pdf/PdfTab.test.tsx`, a two-tab setup with one centre PDF (`.tab-body[data-tab-label="pdf1"]`, `dock: null`) and one docked PDF (`.sidebar-plugin[data-tab-label="pdf2"]`, `dock: 'left'`):
  - Both overlays open with marks on both documents. Blur the overlay input so focus rests on the page body, press Escape, and assert the centre input is gone, the docked input remains, the centre's ranges are gone, and the docked tab's ranges remain.
  - Both overlays open with marks. Click the docked stage so focus is inside the docked tab, press Escape, and assert the docked input is gone, the centre input remains, the docked ranges are gone, and the centre tab's ranges remain.
  - With focus on the page body, Arrow Down moves only the centre tab's page; after clicking the docked stage, Page Down moves only the docked tab's page.
- Existing `usePdfKeys` cases stay green, including "ignores every key and the zoom chord" while the tab is not on screen.
- Existing `PdfTab` "does not answer the chord while the tab is not visible" stays green.
- `$janissary/scripts/run.mjs check-diff` covers lint, typecheck, and the affected web tests.

## Out of scope

- Changing chord routing, `chordTabLabel`, `usePluginChordClaims`, or the PDF manifest's `meta+f` claim.
- Changing `usePdfFind`, `usePdfFindMarks`, `LineFind`, or how a tab's overlay state closes when `active` goes false.
- Making a centre PDF tab's stage focusable, or changing what a centre tab answers when focus rests on its page body.
- Restyling focus outlines beyond the browser default.
- The other entries in `product/backlog/pull-request.md`.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- `npm run test:client -- web/src/plugins/pdf/PdfTab.test.tsx web/src/plugins/pdf/usePdfKeys.test.ts web/src/plugins/pdf/usePdfFind.test.ts web/src/plugins/pdf/usePdfFindMarks.test.tsx web/src/plugins/DockedPluginBody.test.tsx`
- Manual: open a PDF in the centre and dock a second PDF beside it. Open find in both, type a query in each, click the docked page, and press Escape — only the docked overlay closes and the centre's marks remain. Reverse the order with focus on the centre page. Click each page in turn and confirm the arrows move only that tab's page.
