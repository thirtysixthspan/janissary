# Document the focused-tab PDF key rule in the find plan and the PDF spec

**Complexity: 3/10** — documentation only, in two files; the behavior already ships in `usePdfKeyOwnership.ts` and is pinned by the centre-and-docked cases in `PdfTab.test.tsx`. The care is in stating the centre tab's focus condition the same way in both places and keeping the already-correct docked wording untouched.

## Goal

The focused-key repair (`product/plans/complete/pdf-tab-focused-key-ownership.md`) made the PDF view's page, zoom, and Escape keys follow the focused PDF tab. A centre PDF tab answers while it is the current tab and focus is not inside another labelled tab, including when focus rests on its page. A docked PDF tab answers only while focus is inside its own `.pdf-tab`, and its stage takes focus when its page is clicked.

Two documents still describe the earlier rule. `product/plans/complete/pdf-tab-find.md` says the PDF view's keys work whenever focus is outside the find input, and its reuse table, proposed changes, tests, and manual verification never mention `usePdfKeyOwnership.ts`, the focusable docked stage, or the centre tab's focus condition. `product/specs/pdf-tab.md` § Zoom and keys credits the current centre tab with the keys without saying focus must stay out of another tab, and § Find repeats "The arrow and page keys work on the document as usual while focus is outside the overlay" with no owning-tab condition. A reader following either one could reintroduce the two-PDF key collision, and the spec cannot explain why a current centre PDF ignores keys while focus is in a docked shell, harness, or files sidebar.

## Approach

State the rule in the completed find plan where the old rule was written, and record the files the repair added or changed in the plan's reuse table, proposed changes, tests, and verification. The plan stays a record of what the feature delivered, so the additions describe the shipped code rather than a new design.

In the spec, give the centre tab its focus condition beside the docked one in § Zoom and keys, and qualify the § Find sentence about arrows and page keys by pointing at the owning tab and § Zoom and keys rather than restating the rule a third time. The docked paragraph in § Find is already correct and stays as it is.

Verified against the code: `usePdfKeyOwnership` returns false when inactive, true when focus is inside the tab root, and otherwise true only for a centre tab whose focused element has no `[data-tab-label]` ancestor. `PdfTab` passes `ownsKeys && loaded !== null` to `usePdfKeys`, which gates the window `keydown` listener, the stage's Ctrl/Cmd+wheel listener, and the Escape that closes the overlay. `PdfStage` renders `tabIndex={0}` and focuses itself on pointer down only when `focusable`, which `PdfTab` sets for a docked tab.

## Implementation steps

1. In `product/plans/complete/pdf-tab-find.md` § Design decisions, rewrite the decision that begins "The overlay owns its keys while focus is in its input" so that outside the input the page, zoom, and Escape keys belong to the focused PDF tab: a centre PDF while it is current and focus is not inside another labelled tab, a docked PDF only while focus is inside its own `.pdf-tab`.
2. In the same plan's § Moving to a match, qualify "The arrow and page keys work on the document as usual while focus is outside the overlay" with the owning-tab condition.
3. In § What already exists, update the `PDF keys` row so it names the `enabled` gate covering the window keys, the wheel zoom, and Escape, and that `PdfTab` derives `enabled` from `usePdfKeyOwnership`.
4. In § Proposed changes › PDF plugin, add a bullet for `web/src/plugins/pdf/usePdfKeyOwnership.ts` describing the `focusin`/`focusout` focus snapshot and the ownership rule; extend the `PdfTab.tsx` bullet with the `tabRef` on `.pdf-tab`, the `ownsKeys` result passed to `usePdfKeys`, and `focusable={capabilities.dock !== null}`; and add the `focusable` prop to the `PdfStage.tsx` bullet.
5. In § UI design › Keyboard and accessibility, rewrite the paragraph about focus outside the overlay to the same focused-tab rule, including that clicking a docked page puts focus inside it.
6. Add the three centre-and-docked cases to the plan's `PdfTab.test.tsx` test bullet, and add the two-tab check to § Verification's manual step.
7. In `product/specs/pdf-tab.md` § Zoom and keys, state the centre tab's condition (current, and focus not inside another tab, page included) beside the docked one, and name a centre tab with focus in another tab among those that ignore the navigation controls.
8. In `product/specs/pdf-tab.md` § Find, qualify the arrow and page key sentence with the owning tab and a reference to § Zoom and keys.
9. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

No new tests. The change alters no code. The behavior it documents is already pinned by the `a centre and a docked PdfTab` cases in `web/src/plugins/pdf/PdfTab.test.tsx`:

- Escape with focus on the page body closes only the centre overlay and leaves the docked marks.
- Escape after clicking the docked stage closes only the docked overlay and leaves the centre marks.
- Arrow Down with focus on the page body pages only the centre tab; Page Down after clicking the docked stage pages only the docked tab.

`$janissary/scripts/run.mjs check-diff` confirms nothing else changed.

## Out of scope

- Any change to `usePdfKeyOwnership.ts`, `usePdfKeys.ts`, `PdfTab.tsx`, `PdfStage.tsx`, or `PdfTab.test.tsx`.
- The docked paragraph in `product/specs/pdf-tab.md` § Find, which already states the docked condition.
- `documentation/user-documentation/tab-types/pdf-viewer.md`, which already says the keys reach only the PDF tab you are working in and that a docked tab takes them once you click into it.
- The pull request description, and the second entry in `product/backlog/pull-request.md`.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Read the rewritten plan and spec passages against `usePdfKeyOwnership.ts` and the centre-and-docked cases in `PdfTab.test.tsx`.
