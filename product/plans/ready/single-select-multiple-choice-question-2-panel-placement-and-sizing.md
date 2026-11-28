# Center and fit every question panel inside its owning tab view

**Complexity: 5/10** — ~125 added lines, 3 files, 10 requirements (p=5.66)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. Depends on `single-select-multiple-choice-question-1-escape-cancellation.md` for the `question-panel-content` wrapper that carries the Escape handler.

## Goal

Question panels are currently pinned to the top-right of the whole app at a fixed 420px width. They should instead sit centered in the body of the tab that owns the question, sized as an equal percentage of that body's width and height up to 90%, with the question text scrolling while the action controls stay visible. The same treatment must work for centre tabs (including split panes) and for docked plugin tabs. This is a presentation-only step for the existing `ask` and `approve` kinds; no protocol type changes here.

## Requirements

1. "Keep the question panel non-modal and must not trap unrelated input" — the covering layer uses `pointer-events: none` and the panel itself `pointer-events: auto`.
2. "Keep the panel at the same percentage of tab width and tab height, up to 90% each, wrapping text as necessary." For a centre tab, "tab" means that tab's body below the tab strip and inside its pane column; for a docked tab, its docked body.
3. "At the size limit, scroll the content inside the panel while keeping Submit and Cancel visible." The title stays fixed at the top; the question text (and later the choice group and custom field) scrolls; the footer with the controls stays fixed.
4. "Apply equal-percentage sizing and scrolling to all question types." The `ask` footer is the input plus its Submit/Cancel row; the `approve` footer is the option-and-Cancel row. Their DOM order and `useAnswerButtons` wiring stay the same.
5. "Start at the smallest equal percentage of tab width and height that fits the content, up to 90%."
6. "Center the panel in the tab view."
7. "If the tab is too small to fit the fixed controls within 90%, let the panel exceed that limit so the controls remain visible."
8. "If the tab is smaller than the controls even after exceeding 90%, constrain the panel to the tab and allow its entire contents, including controls, to scroll."
9. The size search is pure and returns the smallest whole percentage from 1 to 90 at which the measured content height is no more than that percentage of the layer height, or 90 when nothing fits.
10. The measurement re-runs when the question id changes and when the layer resizes, using `ResizeObserver` when it is available and a single measurement when it is not, so existing jsdom tests need no stub.

## Design decisions

- Render a `div.question-panel-layer` as `QuestionPanel`'s outermost element, wrapping `ModalDialog`. For centre tabs it is a child of the `.center-action-area` grid with `grid-row: 2` and `grid-column: 2` when the owning tab's pane is `'right'` and `grid-column: 1` otherwise, matching `PluginTabLayer` exactly (Assumption 1). `MountedViewLayers` passes the current tab's optional `pane` to `QuestionPanel` as a new optional prop; an absent `pane` means column 1.
- The layer fills its grid cell with `display: flex`, `align-items: center`, and `justify-content: center`, and is transparent to pointer events while the panel inside opts back in with `pointer-events: auto`. This is what keeps the panel non-modal (Preserved 6).
- For docked panels there is no grid: give `.sidebar-plugin` `position: relative` and let the layer fill it with `inset: 0`, so the panel centers inside the docked body rather than against the viewport (Assumption 2).
- Split the children inside `question-panel-content` from subplan 1 into a scrolling `div.question-panel-body` for the question text and a fixed `div.question-panel-footer` holding the existing form or option row. Do not change which refs `useAnswerButtons` receives; keep the existing focus effects keyed on `question.id` and `question.kind`.
- Put the pure percentage search in a new `web/src/shared/questions/panel-fit.ts` exporting `fitPanelPercent(layerWidth, layerHeight, contentHeightAtWidth)`. It takes a callback that reports content height at a candidate width, so the hook owns all DOM reads (Assumption 3).
- Put the DOM side in a new `web/src/shared/questions/useQuestionPanelFit.ts`. A layout effect sets a candidate panel width, reads `scrollHeight`, calls `fitPanelPercent`, then applies the chosen width and height. It observes the layer with `ResizeObserver` like `usePdfStageViewport`; when `ResizeObserver` is undefined it measures once and skips observing.
- Overflow order follows the source: at 90% the body scrolls with the footer visible; when 90% of the layer is shorter than the title plus footer, grow the panel to that fixed height; when that fixed height exceeds the layer, cap the panel at the layer and let the whole panel scroll.
- Keep the `modal` and `modal-button` look. Replace the `top: 44px; right: 14px; width: min(420px, …)` rule in `web/src/theme.css` with the layer, centering, and fitted-size rules.

## Preserved behavior

1. `ask` returns the typed answer and must not return a different value; `web/src/shared/questions/QuestionPanel.test.tsx` "renders a text input and sends the typed answer". The footer still submits the same `answer` state.
2. `approve` returns the selected label and must not submit a different label; `web/src/shared/questions/QuestionPanel.test.tsx` "renders approve options and sends the chosen label". The option row keeps its `respond(option)` callback and refs.
3. The question panel remains non-modal and must not trap unrelated input; `web/src/shared/questions/QuestionPanel.test.tsx` "is non-modal and does not trap unrelated input". The layer's `pointer-events: none` and the panel's `pointer-events: auto` preserve this.
4. Existing answer-button keyboard navigation wraps and must not leave the panel's button sequence unexpectedly; `web/src/shared/questions/QuestionPanel.test.tsx` "cycles Tab and ArrowLeft/ArrowRight between the answer buttons, wrapping around". `useAnswerButtons` and its ref assignment stay in place.
5. `ask` initially focuses its text input and must not focus Cancel instead; `web/src/shared/questions/QuestionPanel.test.tsx` "focuses the text input on render for an ask question". The existing `autoFocus` and effect are unchanged.
6. `approve` initially focuses Cancel and must not focus an option instead; `web/src/shared/questions/QuestionPanel.test.tsx` "focuses Cancel on render for an approve question". The kind-based focus effect is unchanged.
7. When a focused panel's question resolves, focus returns to the harness terminal and must not stay on the body; `web/src/useQuestionFocusReturn.test.tsx` "focuses the same harness terminal when its focused question panel goes away". The `onBeforeRemove` layout cleanup still sees the focused element in the wrapper.
8. A docked plugin tab's question routes its answer to its own tab and must not route to the centre tab; `web/src/plugins/PluginBody.test.tsx` "routes free text, approval and Cancel to the %s dock owner". The docked layer wraps the same panel with the same `question.tab` and `question.id`.

## Assumptions

1. `web/src/plugins/PluginTabLayer.tsx:45` sets `gridColumn: tab.pane === 'right' ? 2 : 1` and `gridRow: 2` on a tab body. Quote: `gridColumn: tab.pane === 'right' ? 2 : 1`.
2. `web/src/theme.css:814` declares `.sidebar-plugin { flex: 1; min-height: 0; flex-direction: column; }` with no `position`, and no sidebar ancestor is positioned, so a docked panel's absolute box currently resolves against the viewport. Quote: `.sidebar-plugin { flex: 1; min-height: 0; flex-direction: column; }`.
3. `web/src/plugins/pdf/usePdfStageViewport.ts:33` observes a container with `new ResizeObserver(measure)`. Quote: `const observer = new ResizeObserver(measure);`.
4. `web/src/theme.css:691` pins the panel with `.question-panel { position: absolute; z-index: 50; top: 44px; right: 14px; width: min(420px, calc(100% - 28px)); }`. Quote: `top: 44px; right: 14px;`.
5. `web/src/App.test.tsx:105` stubs `vi.stubGlobal('ResizeObserver', …)`, while `QuestionPanel.test.tsx`, `useSectionNav.question.test.tsx`, `useQuestionFocusReturn.test.tsx`, and `PluginBody.test.tsx` mount panels without a stub. Quote: `vi.stubGlobal('ResizeObserver', class {`.
6. `web/src/CenterActionArea.tsx:99` places `MountedViewLayers` output as `{persistentLayers}` inside the `.center-action-area` div, so the layer is a direct grid child. Quote: `{persistentLayers}`.
7. `web/src/theme.css:189` defines `.center-action-area` with `grid-template-rows: auto minmax(0, 1fr)`, where row 2 is the tab bodies. Quote: `grid-template-rows: auto minmax(0, 1fr)`.
8. `web/src/MountedViewLayers.tsx:154` renders the question panel directly when the current tab has one. Quote: `{current?.pendingQuestion && (`.
9. `src/protocol/tab.ts:133` declares `pane?: 'right'` on `TabViewBase`, so `current.pane` can be passed straight through. Quote: `pane?: 'right';`.

## Existing functionality

1. `web/src/plugins/PluginTabLayer.tsx:45` provides the grid-column rule to copy for the centre layer.
2. `web/src/plugins/pdf/usePdfStageViewport.ts:33` provides the `ResizeObserver`-based remeasure pattern.
3. `web/src/shared/questions/QuestionPanel.tsx:20` provides `useImperativeHandle` for `focusCancel`, unchanged by this step.
4. `web/src/shared/questions/useAnswerButtons.ts:11` provides the roving-focus handler the existing forms keep using.
5. `web/src/shared/ModalDialog.tsx:11` provides the `modal={false}` dialog surface whose look is retained.

## Implementation steps

1. Add `web/src/shared/questions/panel-fit.ts` with the pure `fitPanelPercent` function described in Requirements and Design decisions. It imports nothing and has no DOM reads. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. Add `web/src/shared/questions/useQuestionPanelFit.ts`. It takes the layer ref, the panel ref, the content-height callback, and `question.id`; runs a layout effect to measure and apply width/height; subscribes to `ResizeObserver` when defined. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. In `web/src/shared/questions/QuestionPanel.tsx`, add the optional `pane?: 'right'` prop, render `div.question-panel-layer` as the outermost element around `ModalDialog`, and split the `question-panel-content` children into `question-panel-body` and `question-panel-footer` while preserving both branches' refs, handlers, and focus effects. Call `useQuestionPanelFit` from the panel. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
4. In `web/src/MountedViewLayers.tsx`, pass `pane={current.pane}` to `QuestionPanel` alongside the existing `question`, `client`, and `onBeforeRemove` props. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
5. In `web/src/theme.css`, replace the fixed top-right rule with the layer, centering, body-scroll/footer-fixed, and fitted-size rules, and add `position: relative` to `.sidebar-plugin`. Keep `.modal`, `.modal-button`, `.question-panel-text`, `.question-panel-form`, and `.question-panel-options` styling. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
6. Add `web/src/shared/questions/panel-fit.test.ts` covering the smallest fitting percentage, the 90% cap when nothing fits, and a monotone content-height function. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Each step is green at its own commit; no step defers a compile fix to a later one.

## UI design

1. The panel appears on its owning tab, centered in that tab's body; for a split centre tab it stays in the owning pane's column.
2. The layer is transparent to pointer input while the panel accepts it, so the panel remains non-modal.
3. The question text sits in a scrolling body; the title stays at the top and the action controls stay in a fixed footer.
4. At up to 90% of the layer's width and height the panel grows from the smallest fitting equal percentage; beyond that the body scrolls, and if the fixed controls cannot fit the panel grows past 90% or, at the extreme, scrolls as a whole inside the layer.
5. The `ask` and `approve` controls keep their current look (`modal`/`modal-button`) and their current keyboard behavior.
6. A resized window or a change of question re-fits the panel.

## Tests

- `web/src/shared/questions/panel-fit.test.ts` (new): smallest fitting percentage, 90% cap, monotone height function — requirement 5 and 9.
- `web/src/shared/questions/QuestionPanel.test.tsx`: keep the eight named preservation tests passing; add assertions that the panel's controls remain reachable and that the layer does not intercept pointer events — requirement 1 and Preserved 3.
- `web/src/plugins/PluginBody.test.tsx` and `web/src/useQuestionFocusReturn.test.tsx`: the named tests continue to pass with the new wrapper — Preserved 7 and 8.
- `web/src/useFocusOnTabSwitch.test.ts` and `web/src/useSectionNav.question.test.tsx`: unchanged tests continue to pass for `ask` and `approve`.

## Out of scope

- The `choose` kind, its form, and its descriptions/default; those come in later subplans.
- Changing `useAnswerButtons`, `ModalDialog`, `QuestionPanelHandle`, or the question protocol.
- Persisting panel size or position across tab switches or reloads.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, issue `question ask "Port?"` and `question approve "Deploy?" yes no` on a centre tab and confirm each panel is centered in the tab body, its controls remain visible while a long question scrolls, and clicking outside the panel still reaches the tab. Shrink the window until the panel reaches 90%, confirming the question text scrolls with Submit/Cancel visible. Dock one plugin tab and open a question there; confirm the panel centers inside that sidebar body rather than the viewport. A fixed 420px panel, hidden controls, or a panel that blocks unrelated input is a failure.
