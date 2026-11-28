# Keep the question text reachable when fixed controls fill the fitted panel height

**Complexity: 3/10** — ~15 added lines across 2 production files, 6 requirements (p=4.62)

## Goal

A short layer, or an approval question with many options, can leave the question panel's title and footer so tall that the flex body has no room. The question text is then clipped by the panel's hidden overflow with no way to scroll to it, so the human can answer without reading what was asked. The panel must fall back to a full-layer-height, scrollable layout that keeps the text reachable alongside the controls.

## Requirements

1. "derive the overflow decision from the measured content height at the final width rather than the once-measured fixedHeight" — the decision uses a content-height measurement taken after the final panel width is chosen.
2. "when the title plus footer leave no room for the body, size the panel to the full layer height and let the panel scroll instead of shrinking the body to zero" — a fitted height consumed by the fixed controls switches the panel to the layer's full height with whole-panel scrolling.
3. "stop .question-panel-body from collapsing to zero under a tall footer by giving it a minimum height or letting .question-panel-content keep its natural height when the panel overflows" — in overflow mode the content keeps its natural height instead of compressing the body.
4. "so the question text is never clipped by a zero-height flex child" — the question text and the footer controls both remain in the scrollable panel in that mode.
5. "Add a test with a short layer and a tall footer that asserts the question text remains visible and scrollable alongside the controls" — a layout-mocked test pins the short-layer/tall-footer fallback.
6. "The cases in web/src/shared/questions/panel-fit.test.ts and the existing QuestionPanel structure and focus tests must keep passing" — the pure search and the panel's structure and focus behavior stay green.

## Design decisions

- Leave `fitPanelPercent` and its three pure tests untouched; the smallest-fitting-percentage search is not in question.
- Reuse the existing `contentHeightAtWidth` callback after the search to read the panel's natural height at the chosen final width, and read the title and footer heights at that same width for the "no room for the body" check. This replaces the single pre-search `fixedHeight` read.
- Decide overflow from that final-width content height against the layer height, and from the final-width fixed-control height against the fitted height. Either condition selects the fallback.
- Apply the fallback by setting the panel to the layer's full height with `overflow-y: auto`, and toggle a class on the panel so CSS can relax the flex constraints only in that mode. An unconditional body `min-height` is avoided because it would crowd the footer in the normal fitted mode.
- Keep `QuestionPanel.tsx` markup, refs, handlers, and focus effects unchanged; the panel keeps its existing structure and non-modal behavior.

## Preserved behavior

1. The body holds the question text and the footer holds the controls, and must not swap them or drop either; `web/src/shared/questions/QuestionPanel.test.tsx` "keeps the controls reachable through a pointer-transparent layer" pins the structure.
2. The pure search returns the smallest fitting whole percentage and caps at 90, and must not report a different percentage; `web/src/shared/questions/panel-fit.test.ts` "returns the smallest percentage whose height fits the content" pins it.
3. A free-text panel focuses its text field on open and must not focus Cancel instead; `web/src/shared/questions/QuestionPanel.test.tsx` "focuses the text input on render for an ask question" pins it.
4. An approval panel focuses Cancel on open and must not focus an option instead; `web/src/shared/questions/QuestionPanel.test.tsx` "focuses Cancel on render for an approve question" pins it.
5. Answer-button navigation wraps within the panel and must not leave the button sequence unexpectedly; `web/src/shared/questions/QuestionPanel.test.tsx` "cycles Tab and ArrowLeft/ArrowRight between the answer buttons, wrapping around" pins it.
6. The panel stays non-modal and lets unrelated clicks through and must not start trapping input; `web/src/shared/questions/QuestionPanel.test.tsx` "is non-modal and does not trap unrelated input" pins it.

## Assumptions

1. `web/src/shared/questions/useQuestionPanelFit.ts:30` takes the control height once, before any candidate width is applied: `const fixedHeight = (title?.offsetHeight ?? 0) + (footer?.offsetHeight ?? 0);`.
2. `web/src/shared/questions/useQuestionPanelFit.ts:43` decides scrolling from that same early value: `panel.style.overflowY = fixedHeight > layerHeight ? 'auto' : 'hidden';`.
3. `web/src/theme.css:704` lets the body compress to nothing: `.question-panel-body { flex: 1; min-height: 0; overflow-y: auto; }`.
4. `web/src/shared/questions/panel-fit.test.ts:5` pins the pure search: `it('returns the smallest percentage whose height fits the content', () => {`.
5. `web/src/shared/questions/QuestionPanel.test.tsx:124` pins the existing body/footer split: `it('keeps the controls reachable through a pointer-transparent layer', () => {`.
6. `web/src/shared/command-bar/useCommandBarInset.test.tsx:29` shows the ResizeObserver-callback pattern for remeasuring after metrics are stubbed: `vi.stubGlobal('ResizeObserver', class {`.
7. `web/src/notifications/capture-layout.test.ts:6` shows the raw-CSS assertion pattern: `readFileSync('web/src/theme.css', 'utf8')`.

## Existing functionality

1. `web/src/shared/questions/panel-fit.ts:4` provides `fitPanelPercent`, reused without change.
2. `web/src/shared/questions/useQuestionPanelFit.ts:23` provides the `measure` layout effect and its `ResizeObserver` subscription, extended rather than replaced.
3. `web/src/shared/questions/useQuestionPanelFit.ts:32` provides `contentHeightAtWidth`, reused for the final-width measurement.
4. `web/src/shared/theme.css:696` provides the `.question-panel` flex rules that an overflow-mode rule extends.
5. `web/src/shared/command-bar/useCommandBarInset.test.tsx:29` provides the observer-callback pattern the new layout test follows.

## Implementation steps

1. In `web/src/shared/questions/useQuestionPanelFit.ts`, remove the `fixedHeight` read that happens before the search. After the chosen width is computed, call `contentHeightAtWidth` once more at that width to get the natural content height, then read the title and footer heights at that same width. Compute the fitted height from the layer height and the chosen percentage, and select overflow mode when the content height exceeds the layer height or the title-plus-footer height leaves no room below the fitted height. Apply the layer height with `overflow-y: auto` in overflow mode and the fitted height with hidden overflow otherwise, and toggle a panel class that marks overflow mode. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. In `web/src/theme.css`, add an overflow-mode rule keyed on that class so `.question-panel-content` keeps its natural height and the body is not squeezed by a tall footer. Leave the normal fitted-mode rules unchanged. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. In `web/src/shared/questions/QuestionPanel.test.tsx`, add a short-layer/tall-footer case: stub `ResizeObserver`, render an approval question, stub the layer's width and height and the title and footer heights, trigger the captured observer callback, and assert the panel takes the full layer height with auto overflow, carries the overflow class, and still contains the question text and controls. Assert the matching raw CSS rule so the natural-height fallback is pinned. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
4. Update `product/specs/agent-questions.md` with the user-visible fallback: in a short layer or with tall fixed controls the panel fills the layer and scrolls as a whole instead of hiding the question text. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Each step is green at its own commit; no step defers a compile fix to a later one.

## UI design

1. In the normal case the panel keeps its smallest fitting equal-percentage size, with the title and footer fixed and the question text scrolling in the body.
2. When the fixed controls fill the fitted height, the panel grows to the layer's full height and scrolls as a whole, with the question text at its natural height above the controls.
3. The question text is never clipped by a zero-height body, and the controls remain present and operable.
4. Resizing the layer back to a size where the controls fit restores the fitted sizing and body-only scrolling.

## Tests

- `web/src/shared/questions/QuestionPanel.test.tsx` (new case): short layer and tall footer select the full-height scrollable fallback, keep the text and controls in the panel, and apply the CSS natural-height rule — requirements 1 through 5.
- `web/src/shared/questions/panel-fit.test.ts`: the three existing cases keep passing — requirement 6 and Preserved 2.
- `web/src/shared/questions/QuestionPanel.test.tsx`: the existing structure, answer, Escape, and focus cases keep passing — requirement 6 and Preserved 1, 3, 4, 5, 6.

## Out of scope

- Changing `fitPanelPercent`, `QuestionPanel.tsx`, `ModalDialog`, `useAnswerButtons`, or the question protocol.
- An unconditional `min-height` on `.question-panel-body` in the normal fitted mode.
- Help pages and user or developer documentation.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, dock a plugin tab and shrink the sidebar until it is short, open `question approve` with enough options that the buttons wrap into a tall footer, and confirm the question text is visible and the panel scrolls to show both the text and the controls. Repeat in a centre tab with a short window. A clipped question, a zero-height text area, or a panel that cannot scroll is a failure; a panel that grows past the layer or stops respecting the 90% fit in the normal case is also a failure.
