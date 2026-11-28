# Single-select multiple-choice question

**Complexity: 7/10** — ~350 added production lines, 14 existing production files and 38 behavioral requirements (p=7.98).

## Goal

Let an agent present a single-choice list with a free-form alternative and receive one answer.

## Requirements

1. Provide `question choose "<question>" <option> [<option> …]` and a matching question-tool kind.
2. Render the labels as a radio-style single-answer list.
3. Always offer “Type your own answer” as an alternative to the listed options.
4. Return one value: the chosen label or the typed text.
5. Include command parsing, the agent primer, role and command inventory, protocol, panel keyboard navigation, and functional spec.
6. “Select a radio option, then press Submit.”
7. “Typing in the associated field automatically selects the alternative.”
8. “Keep the question open and disable Submit until a choice is selected.”
9. “Disable Submit until it contains non-whitespace text” when the free-form alternative is selected.
10. “Trim leading and trailing whitespace before returning it” for a typed answer.
11. “Reject the request as invalid and return usage or validation feedback” when option labels are duplicated.
12. “Reject exact matches only; retain labels that differ in case or whitespace.”
13. “Reject it as invalid, with usage or validation feedback” for a blank or whitespace-only option label.
14. “Reject it as invalid, with usage or validation feedback” for blank or whitespace-only question text.
15. “Reject it as invalid; at least one listed option is required.”
16. Include option descriptions alongside labels.
17. Include a caller-specified default selection.
18. Provide option descriptions through “both the question tool and the question choose command.”
19. Use a repeatable `--description` argument immediately after the option it describes in the command.
20. Allow a default selection through both the question tool and the `question choose` command.
21. Identify the default by its exact option label, using `--default` in the command.
22. Reject the request as invalid, with usage or validation feedback, if the default label does not exactly match an option.
23. “Preselect the default and enable Submit; the person may change it.”
24. Reject the exact option label “Type your own answer” as reserved.
25. Return updated usage text for malformed commands and a validation error for tool calls.
26. Support an `--option` flag to introduce any command option label explicitly, including labels matching flags.
27. Reject empty or whitespace-only option descriptions as invalid.
28. Keep typed alternative text while the question remains open when switching selections.
29. Label the submission button “Submit”.
30. Escape cancels all question types while focus is inside the panel and notifies the caller that the question is cancelled.
31. Escape returns the existing `Question cancelled.` result.
32. Place `--default` immediately after the question, before the option list.
33. Reject repeated `--default` or multiple `--description` arguments for one option and return usage text.
34. Return `Invalid choice question.` for invalid choice tool input.
35. Name the tool's default-label field `defaultOption`.
36. Grant `question choose` to built-in roles that currently have `question ask` or `question approve`.
37. Add the usage line `question choose "<question>" [--default <label>] <option> [--description <text>] ...` alongside the existing lines.

## Design decisions

- Use a native radio group with a fieldset and legend to associate the question with its choices and provide standard single-selection semantics. Reconcile its keyboard behavior with the existing panel navigation. Sources: https://www.w3.org/WAI/tutorials/forms/grouping/ and https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/radio_role.
- Extend the existing pending-question contract with structured choice options and an optional default.
- Validate choice requests through a shared server-side mechanism used by the command and question tool.
- Keep the string-only answer RPC and accept any nonblank string for choice questions.
- The choice tool accepts an array of objects with a label and optional description.
- Ensure MCP schema validation and both local and remote call paths return `Invalid choice question.` for invalid choice inputs, including inputs rejected before registration.
- Use the existing `useAnswerButtons` behavior for the existing forms; use native radio behavior for the choice group. Use standard string trimming for custom answers and add no dependency.

## Preserved behavior

1. `ask` returns the typed answer and must not return a different value; `web/src/shared/questions/QuestionPanel.test.tsx` “renders a text input and sends the typed answer”.
2. `approve` returns the selected label and must not submit a different label; `web/src/shared/questions/QuestionPanel.test.tsx` “renders approve options and sends the chosen label”.
3. Cancel returns the cancellation result and must not submit an answer; `src/questions.test.ts` “reports cancellation to the waiting agent”.
4. A second question on the same tab waits and must not replace the active question; `src/questions.test.ts` “holds a second question until the first resolves”.
5. Closing a tab resolves active and queued questions and must not leave callers waiting; `src/questions.test.ts` “resolves active and queued questions when their tab closes”.
6. The question panel remains non-modal and must not trap unrelated input; `web/src/shared/questions/QuestionPanel.test.tsx` “is non-modal and does not trap unrelated input”.
7. Existing answer-button keyboard navigation wraps and must not leave the panel's button sequence unexpectedly; `web/src/shared/questions/QuestionPanel.test.tsx` “cycles Tab and ArrowLeft/ArrowRight between the answer buttons, wrapping around”.
8. `ask` initially focuses its text input and must not focus Cancel instead; `web/src/shared/questions/QuestionPanel.test.tsx` “focuses the text input on render for an ask question”.
9. `approve` initially focuses Cancel and must not focus an option instead; `web/src/shared/questions/QuestionPanel.test.tsx` “focuses Cancel on render for an approve question”.

## Assumptions

1. `src/questions.ts:25` declares `register` with a `Promise<string>` result.

## Existing functionality

1. `src/question-command.ts:29` defines `parseQuestionCommand` for existing question commands.
2. `src/questions.ts:46` defines `pendingFor` for the tab's pending question.
3. `web/src/shared/questions/QuestionPanel.tsx:41` renders the non-modal `ModalDialog`.
4. `product/specs/agent-questions.md:41` specifies “one pending question at a time” per tab.
5. `src/mcp/question-tool.ts:28` defines `validateQuestionArgs`, used by both `src/mcp/handler.ts` and `src/remote/mcp-relay.ts`.
6. `src/protocol/core-rpc.ts:34` defines `answerQuestion` with a string or null answer.
7. `web/src/useFocusOnTabSwitch.ts:34` calls `focusCancel` for pending questions.
8. `web/src/shared/questions/useAnswerButtons.ts:12` defines `useAnswerButtons` for existing answer-button navigation.

## Implementation steps

Implement one integrated checkpoint, keeping server and client contracts green together. Extend `src/protocol/tab.ts` and `src/questions.ts` with structured choice options and default selection while retaining the string/null answer RPC; validate nonblank choice answers server-side. Extend `src/question-command.ts`, `src/commands/question.ts`, and `src/commands/forms.ts` for parsing, matching, usage and primer. Extend `src/mcp/question-tool.ts`, `src/mcp/tools.ts`, `src/mcp/executor.ts`, and the local and remote MCP paths for the structured tool input and shared validation. Update the application command inventory and role declarations in `src/plugins/roles/`, granting the new command to built-in roles with either existing question command. Update `QuestionPanel`, its focus handle and tab-switch integration, and `web/src/theme.css` for the described interactions. Update `help/question.md`, `help/commands.md` and `product/specs/agent-questions.md`. Use `.js` relative imports in server code and extract cohesive modules if a source file would exceed 200 lines. Run `$janissary/scripts/run.mjs check-diff` as the build and verification command for this checkpoint.

## UI design

1. The existing `QuestionPanel` displays the question on its owning tab, using the existing question panel surface.
2. Stack radio options vertically, with each description beneath its label, followed by the custom answer and Submit/Cancel controls.
3. On opening, focus the first choice if there is no default; otherwise focus Submit.
4. Use standard radio behavior: arrow keys move and select choices, Space selects, and Tab moves to the next control.
5. Tab and Shift+Tab wrap within the choice form, matching existing question-panel controls.
6. Escape cancels any question type while focus is inside its panel.
7. Keep the panel at the same percentage of tab width and tab height, up to 90% each, wrapping text as necessary.
8. At the size limit, scroll the content inside the panel while keeping Submit and Cancel visible.
9. Apply equal-percentage sizing and scrolling to all question types.
10. On returning to a tab with a pending choice question, focus Submit if enabled, otherwise the first choice.
11. Name the custom field “Type your own answer” for assistive technology and name the radio group by the question.
12. Match the existing `QuestionPanel` and `modal-button` theme conventions.
13. Explicitly activating the custom-answer radio with Space or a click moves focus to its text field; arrow selection keeps focus in the radio group.
14. Start at the smallest equal percentage of tab width and height that fits the content, up to 90%.
15. Center the panel in the tab view.
16. If the tab is too small to fit the fixed controls within 90%, let the panel exceed that limit so the controls remain visible.
17. Keep shared question presentation in `web/src/shared/questions/`, with server-owned question state projected to the client and only view-local selection and focus state held in the client.
18. If the tab is smaller than the controls even after exceeding 90%, constrain the panel to the tab and allow its entire contents, including controls, to scroll.
19. Enter on a choice or in the custom-answer field submits the current valid answer; it does nothing while Submit is disabled.

## Tests

Extend `src/question-command.test.ts` and `src/mcp/question-tool.test.ts` for requirements 1, 11–15, 18–22, 24–27 and 32–35, including quoted flags and invalid requests. Extend `src/questions.test.ts` and MCP relay tests for requirements 4, 10, 25 and 34, including cancellation and nonblank validation. Extend `web/src/shared/questions/QuestionPanel.test.tsx` and `web/src/useFocusOnTabSwitch.test.ts` for requirements 2–4, 6–10, 16–17, 23, 28–31 and all UI decisions, including keyboard, focus, overflow, all question kinds and tiny tabs. Extend command and role inventory tests for requirements 5 and 36, and command usage tests for requirement 37. Keep the named preservation tests passing.

## Out of scope

Multiple selections and a caller-specified answer-length limit are outside this version.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. In the running app, issue `question choose "Release?" --default stable stable --description "Stable release" beta`, verify stable is selected with its description and Submit focused, submit it and verify the caller receives `stable`. Repeat with a typed alternative and verify the trimmed text is returned; Escape should return `Question cancelled.`. A missing panel, wrong value, or wrong focus is a failure.
