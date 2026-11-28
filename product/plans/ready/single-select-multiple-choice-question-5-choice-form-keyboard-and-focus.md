# Finish choice-form keyboard navigation and focus behavior

**Complexity: 5/10** — ~60 added lines, 8 requirements, 10 scenarios (p=5.37)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. Depends on `single-select-multiple-choice-question-1-escape-cancellation.md` for the Escape handler table, on `single-select-multiple-choice-question-4-choice-form.md` for the form itself, and on `single-select-multiple-choice-question-2-panel-placement-and-sizing.md` for the panel wrapper.

## Goal

The choice form renders, but its focus life is not finished. A person should get predictable focus when the panel opens and when they return to its tab, Tab and Shift+Tab should wrap inside the form, arrow keys should keep focus in the radio group, and explicitly activating the custom radio should move focus to its text field. Escape must cancel a choice question just as it does the other kinds, and Shift+Tab inside the form must not cycle application sections.

## Requirements

1. "Typing in the associated field automatically selects the alternative." (requirement 7)
2. "On opening, focus the first choice if there is no default; otherwise focus Submit." (UI design 3)
3. "Use standard radio behavior: arrow keys move and select choices, Space selects, and Tab moves to the next control." (UI design 4)
4. "Tab and Shift+Tab wrap within the choice form, matching existing question-panel controls." (UI design 5)
5. "On returning to a tab with a pending choice question, focus Submit if enabled, otherwise the first choice." (UI design 10)
6. "Explicitly activating the custom-answer radio with Space or a click moves focus to its text field; arrow selection keeps focus in the radio group." (UI design 13)
7. "Enter on a choice or in the custom-answer field submits the current valid answer; it does nothing while Submit is disabled." (UI design 19)
8. Mark the choice form `data-claims-shift-tab` so `useSectionNav` stands down for keys inside it. (Assumption 5)

## Design decisions

- Selection and typed text are view-local and keyed by `question.id`; the form is remounted on a new question. Returning to a tab re-keys or unmounts the centre panel, so the default selection is restored and typed text is cleared on return; server state is unchanged (Assumption 1, Assumption 2). Because state resets, the return focus target equals the open focus target: Submit when a default exists, otherwise the first choice. No new `QuestionPanelHandle` method is needed.
- In `useFocusOnTabSwitch`, keep the early return for any pending question but skip the `focusCancel()` call when the pending kind is `choose`; the form's own mount-focus effect then stands. `focusCancel` is still called for `ask` and `approve` (Assumption 3).
- Tab wrapping: Tab from Cancel focuses the group's current stop (the checked radio, or the first radio when none is checked); Shift+Tab from any radio focuses Cancel; every other Tab press is native, so a disabled Submit is naturally skipped. Tab order is the radio group, the custom field, Submit when enabled, then Cancel.
- Move focus from the custom radio to its text field only on a Space `keyup` on that radio, or a pointer click on the radio or its label (`click` with `detail > 0`). Browsers also fire `click` with `detail` 0 when arrow keys select a radio, so a plain click handler cannot distinguish the two (Assumption 4). Arrow-key selection therefore leaves focus in the group.
- Enter in the custom field uses the browser's native implicit form submission; the disabled Submit blocks it while the answer is absent. Enter on a radio calls the form's native `requestSubmit()`, because browsers differ on whether a radio submits implicitly. The form's `onSubmit` from subplan 4 ignores an absent answer, so neither path sends a blank value.
- Add the `choose` row to the Escape test table introduced by `single-select-multiple-choice-question-1-escape-cancellation.md`; the handler itself is unchanged and already wraps all panel children.
- No changes to `QuestionPanelHandle` or its test stubs.

## Preserved behavior

1. Switching to a tab with a pending `ask` or `approve` question focuses that panel's Cancel and must not focus the terminal or command line; `web/src/useFocusOnTabSwitch.test.ts` "focuses the question dialog Cancel button instead when the active tab has a pending question". The `choose` exception is added without changing the `ask`/`approve` path.
2. Shift+Tab inside an existing panel stays in the panel and must not cycle application sections; `web/src/useSectionNav.question.test.tsx` "moves from Cancel to the last option instead of cycling sections". The choice form gains its own `data-claims-shift-tab` marker while the existing marker on the `ask` form and `approve` row is untouched.

## Assumptions

1. `web/src/shared/questions/QuestionPanel.tsx` is rendered with `key={question.id}` for `choose` from subplan 4, so a new question starts with fresh selection and text. Quote: `key={question.id}`.
2. `web/src/MountedViewLayers.tsx:154` mounts the centre panel only for the current tab. Quote: `{current?.pendingQuestion && (`.
3. `web/src/useFocusOnTabSwitch.ts:34` calls `focusCancel` for every pending question today. Quote: `if (currentRef.current?.pendingQuestion) { questionPanelRef.current?.focusCancel(); return; }`.
4. The source design decision states that browsers also fire `click` with `detail` 0 when arrow keys select a radio, so a plain click handler cannot distinguish that from a pointer click with `detail > 0`. Quote: `product/plans/complete/single-select-multiple-choice-question.md:152` — `Browsers also fire `click` (with `detail` 0) when arrow keys select a radio`.
5. `web/src/useSectionNav.ts:71` stands down for keys inside `[data-claims-shift-tab]`. Quote: `if (e.defaultPrevented || keyboardCapturedRef.current || claimsShiftTab(e.target)) return;`.
6. `web/src/shared/tab/handles.ts:13` declares `export type QuestionPanelHandle = { focusCancel(): void };`. Quote: `export type QuestionPanelHandle = { focusCancel(): void };`.
7. `web/src/plugins/PluginBody.tsx:173` renders a docked panel without a ref, so docked panels keep their open-focus behavior and take no part in tab-switch focus. Quote: `<QuestionPanel question={pendingQuestion} client={client} />`.

## Existing functionality

1. `web/src/shared/questions/QuestionPanel.tsx:41` provides the question-keyed panel mount that resets view-local choice state.
2. `web/src/useFocusOnTabSwitch.ts:9` provides `focusCenterVisibleTab`, unchanged; the `choose` path simply returns before calling it.
3. `web/src/useSectionNav.ts:41` provides `claimsShiftTab`, already wired to the `data-claims-shift-tab` marker.
4. `web/src/shared/questions/QuestionPanel.tsx:33` provides `respond`, reached by native submission through the form's `onSubmit` from subplan 4.
5. `web/src/shared/questions/QuestionPanel.test.tsx` provides the Escape test table that gains the `choose` row.

## Implementation steps

1. In `web/src/shared/questions/ChoiceQuestionForm.tsx`, add the mount-focus effect: focus Submit when a default is present and the answer is valid, otherwise focus the first listed radio. Keep it keyed on `question.id` so remounting after a tab switch restores the same focus target. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. In the same component, add `onChange` on the custom field to select the custom radio, add Tab/Shift+Tab wrap between Cancel and the radio group, and add the Space-`keyup`/pointer-click rule for focusing the custom field while leaving arrow selection in the group. Add the `data-claims-shift-tab` marker to the form and native `requestSubmit()` on Enter over a radio. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. In `web/src/useFocusOnTabSwitch.ts`, keep the pending-question early return but guard the `focusCancel()` call on `kind !== 'choose'`. Do not change `QuestionPanelHandle` or the `ask`/`approve` behavior. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
4. Extend `web/src/shared/questions/QuestionPanel.test.tsx` with: first choice focused on open without a default, Submit focused with a default, typed text selecting the alternative, text retained across selection changes, Tab/Shift+Tab wrapping, Space or click moving focus to the custom field while an arrow keeps it in the group, Enter doing nothing while Submit is disabled, Escape sending `null` for `choose`, and an unmount/remount pair asserting the return-focus targets. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
5. Extend `web/src/useFocusOnTabSwitch.test.ts` with a `choose` row asserting neither `focusCancel` nor centre focus is called, and keep the existing `approve` row passing. Extend `web/src/useSectionNav.question.test.tsx` with a Shift+Tab-on-choice-radio row. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Every step is green at its own commit.

## UI design

1. Opening a choice question focuses Submit when a default exists, otherwise the first choice.
2. Tab and Shift+Tab wrap inside the form; Tab order is the radio group, custom field, Submit when enabled, then Cancel. A disabled Submit is skipped natively.
3. Arrow keys move and select radios while focus stays in the group; Space or a pointer click on the custom radio moves focus to its text field.
4. Returning to the tab restores the same focus target because selection state resets.
5. Enter with a valid answer submits; Enter while Submit is disabled does nothing.
6. Escape cancels the choice question through the wrapper from subplan 1.

## Tests

- `web/src/shared/questions/QuestionPanel.test.tsx`: requirements 1 through 7 plus the `choose` Escape row (requirement 8 of subplan 1), including the unmount/remount return-focus checks and the Space-versus-arrow focus distinction.
- `web/src/useFocusOnTabSwitch.test.ts`: requirement 5 and Preserved 10.
- `web/src/useSectionNav.question.test.tsx`: requirement 8 and Preserved 11.
- Keep `web/src/useQuestionFocusReturn.test.tsx` and `web/src/plugins/PluginBody.test.tsx` passing unchanged.

## Out of scope

- Persisting choice selection or typed text across tab switches or reloads; the deliberate cut is that a half-made choice is lost.
- Adding a focus method to `QuestionPanelHandle` or changing docked-panel focus on open.
- Server validation, command grammar, tool schema, and documentation.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, open a choice question without a default and confirm the first radio has focus; open one with `--default` and confirm Submit has focus. Press Escape with focus inside the form and confirm `Question cancelled.`. Arrow down to `Type your own answer` and confirm focus stays in the group, then press Space and confirm focus moves to the field. Tab from Cancel and from a radio and confirm focus wraps inside the form. Switch tabs and back and confirm the default (or first choice) is focused and any typed text is cleared. A focus target on the terminal, a trapped Tab, or retained typed text after returning is a failure.
