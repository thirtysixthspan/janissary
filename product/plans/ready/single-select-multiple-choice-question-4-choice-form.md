# Render the single-choice form and submit one answer

**Complexity: 5/10** — ~105 added lines, 2 files, 12 requirements (p=5.69)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`. Depends on `single-select-multiple-choice-question-2-panel-placement-and-sizing.md` for the body/footer split and on `single-select-multiple-choice-question-3-protocol-and-shared-label.md` for `QuestionChoice`, `choices`, `defaultOption`, and `CUSTOM_ANSWER_LABEL`.

## Goal

When a `choose` question arrives, the panel should show the listed labels as a radio group, always offer a free-form alternative, and send back exactly one value: the selected label or the trimmed typed text. This subplan builds that form and wires it into the panel. It establishes rendering, state, validation of the answer, and the fixed footer; the keyboard wrapping, focus placement, and focus-return behavior are finished in `single-select-multiple-choice-question-5-choice-form-keyboard-and-focus.md`.

## Requirements

1. "Render the labels as a radio-style single-answer list." (UI design 2)
2. Always offer "Type your own answer" as an alternative to the listed options. (UI design 2, requirement 3)
3. "Return one value: the chosen label or the typed text." (requirement 4, paired with the server acceptance in `single-select-multiple-choice-question-7-questions-carry-through.md`)
4. "Select a radio option, then press Submit." (requirement 6)
5. "Keep the question open and disable Submit until a choice is selected." (requirement 8)
6. "Disable Submit until it contains non-whitespace text" when the free-form alternative is selected. (requirement 9)
7. "Trim leading and trailing whitespace before returning it" for a typed answer. (requirement 10)
8. "Include option descriptions alongside labels." (requirement 16)
9. "Preselect the default and enable Submit; the person may change it." (requirement 23)
10. "Keep typed alternative text while the question remains open when switching selections." (requirement 28)
11. Label the submission button "Submit". (requirement 29)
12. Name the custom field and the radio group for assistive technology: the group is named by the question and the field by the custom label. (UI design 11)

## Design decisions

- Add `web/src/shared/questions/ChoiceQuestionForm.tsx`, a plain presentational component that takes the pending question and a submit callback and owns the selection and custom-text state. It imports `CUSTOM_ANSWER_LABEL` from `@shared/shared/question-choice` (Assumption 1).
- Render a native `fieldset` with a `legend` carrying the question text, a vertical radio per choice with its description underneath, then a final radio for the custom alternative with its text field below it. Native radios give single-selection semantics without a custom state machine (Assumption 2).
- Derive the answer inline from view state: a selected listed label is sent verbatim; the custom radio's text is trimmed with `String.prototype.trim`. The answer is absent when nothing is selected or the trimmed text is empty, and `Submit` is `disabled` while it is absent. No separate answer-shaping module.
- Seed the selection from `question.defaultOption` when it is present, so Submit is enabled on open; otherwise start with no selection and a disabled Submit. The seed is view-local state only; the server holds no selection (Assumption 3).
- Keep the typed string in its own state and never clear it when the selection changes, so switching to a listed choice and back restores it.
- The form's `onSubmit` reads the derived answer, ignores an absent answer, and calls the submit callback with a string. Enter in the custom field uses native implicit submission, which the browser blocks while Submit is disabled; no custom Enter handler in this step.
- Do not use `useAnswerButtons` in this form. Its Tab handling wraps inside a single button row and would trap Tab between Submit and Cancel; the choice form uses native radio and tab order instead (Assumption 4).
- In `QuestionPanel`, make the non-`ask` branch an explicit `approve` branch and add a `choose` branch that renders `ChoiceQuestionForm` with `key={question.id}` inside the fixed footer area. Give the form two callbacks: one that calls the panel's `respond(answer)` with the derived string, and one that calls `respond(null)` for Cancel, the same path the existing buttons use. The body already renders the question text from subplan 2.
- If `ChoiceQuestionForm.tsx` would cross the 200-line `max-lines` limit, extract the per-choice radio row into its own component in the same `web/src/shared/questions/` directory; do not compact code or strip spacing to fit.

## Preserved behavior

None found. This step adds a new branch for a kind no existing question can produce; the `ask` and `approve` branches keep their tests passing unchanged.

## Assumptions

1. `src/shared/question-choice.ts` exports `CUSTOM_ANSWER_LABEL` with the exact value `Type your own answer`; the form imports it at runtime through `@shared/shared/question-choice`. Quote: `CUSTOM_ANSWER_LABEL`.
2. The W3C grouping guidance and the ARIA radio role are the stated source for the fieldset/legend radio group; native radios provide the single-selection semantics.
3. `src/questions.ts:58` accepts a `choose` answer as any nonblank string; the server does not check it against labels or trim it, so the client owns trimming. Quote: `answer(tab: string, id: string, answer: string | null): boolean`.
4. `web/src/shared/questions/useAnswerButtons.ts:12` wraps Tab and ArrowLeft/ArrowRight inside one row of button refs. Quote: `export function useAnswerButtons(count: number)`.
5. `web/src/shared/questions/QuestionPanel.tsx:43` currently treats every non-`ask` kind as approve. Quote: `{question.kind === 'ask' ? (`.
6. `web/src/theme.css:691` and the rules added by `single-select-multiple-choice-question-2-panel-placement-and-sizing.md` give the panel a scrolling body and a fixed footer; the choice form occupies the footer alongside the existing controls. Quote: `.question-panel {`.

## Existing functionality

1. `src/shared/question-choice.ts` supplies the one reserved label constant for the alternative radio.
2. `web/src/shared/questions/QuestionPanel.tsx:33` supplies `respond(value)`, which the form's submit callback calls through the panel.
3. `web/src/shared/ModalDialog.tsx:11` supplies the non-modal dialog surface the form renders inside.
4. `web/src/theme.css` supplies the `.modal`/`.modal-button` styling the Submit and Cancel buttons reuse.
5. `web/src/shared/questions/QuestionPanel.tsx:41` supplies the `question-panel-footer` region from subplan 2 that hosts the form.

## Implementation steps

1. Add `web/src/shared/questions/ChoiceQuestionForm.tsx` with the fieldset/legend group, the per-choice radios and descriptions, the custom radio and its always-enabled field, the derived answer, the disabled Submit, the Cancel button, and the view-local selection and text state. Seed from `defaultOption`, keep typed text across selection changes, and label the group and field for assistive technology. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. In `web/src/shared/questions/QuestionPanel.tsx`, change the two-way branch into explicit `ask`, `approve`, and `choose` branches, rendering `ChoiceQuestionForm` with `key={question.id}` and a submit callback that calls `respond(answer)` for the `choose` branch. Keep the `ask` and `approve` markup and refs untouched. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
3. Add choice-form rules under the existing `.question-panel` selectors in `web/src/theme.css`: vertical radio rows, descriptions beneath labels, the custom field beneath its radio, and the fixed Submit/Cancel footer. Match the existing `modal`/`modal-button` conventions. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
4. Add render tests to `web/src/shared/questions/QuestionPanel.test.tsx` with a `choose` pending question: default preselected with Submit enabled, first choice focused without a default (focus is finished in subplan 5, so assert only that a first choice exists here), descriptions shown, typed text trimmed on submit, typed text preserved across selection changes, Submit disabled and no answer sent while nothing valid is selected, and the button labeled `Submit`. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

Each step is green at its own commit and leaves no dangling reference.

## UI design

1. Radio options stack vertically with each description beneath its label.
2. The custom alternative is the last radio in the same group, labeled `Type your own answer`, with its text field directly beneath it. The field is always enabled and is a tab stop.
3. The radio group is named by the question and the custom field by `Type your own answer`, for assistive technology.
4. Submit reads `Submit`; Cancel keeps the existing `modal-button` look.
5. The choose form renders inside the fixed footer from subplan 2, so the question text above it scrolls while the controls stay visible.
6. Shared question presentation stays in `web/src/shared/questions/`; only selection and typed text are view-local.

## Tests

- `web/src/shared/questions/QuestionPanel.test.tsx`: requirements 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 and 12 — default preselected, listed label submitted verbatim, description shown, typed text trimmed, typed text retained across switches, disabled Submit with no answer sent, `Submit` label, and accessible names.
- Keep the `ask` and `approve` preservation tests passing; no named preservation test is edited in this step.
- Add no test of documentation.

## Out of scope

- Tab/Shift+Tab wrapping, Space-versus-arrow focus behavior, Enter submission for radios, mount and tab-switch focus, and focus return (all in `single-select-multiple-choice-question-5-choice-form-keyboard-and-focus.md`).
- Validation of option labels, duplicates, descriptions, or defaults (server side, later subplans).
- Changing the `ask` or `approve` branches or `useAnswerButtons`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, issue a `choose` question command once the command parser from `single-select-multiple-choice-question-8-command-parsing.md` has landed, or use a fixture pending question with `kind: 'choose'`, `choices`, and `defaultOption`. Confirm the radio list and descriptions render, the `Type your own answer` radio and its field are present, the default is selected with Submit enabled, typing into the field and submitting returns the trimmed text, and switching between a listed choice and the custom field keeps the typed text. Submit with no selection must be disabled. A missing alternative, untrimmed text, lost typed text, or an enabled empty Submit is a failure.
