<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle keyboard focus for the choice form so the panel's focus contract holds for every question kind

Existing Issue: The new choose branch of the question panel renders its form without assigning the Cancel button to the panel's cancel ref or giving any control initial focus, so the imperative focusCancel is a no-op for choose questions and a freshly opened choice panel leaves focus wherever it was. Severity: 5/10

Existing Risk: 5/10 - Switching to a tab that holds a pending choice question leaves keyboard focus outside the dialog, and a keyboard user who opens one has no predictable starting control, so the answer and cancel controls are easy to miss in a non-modal panel that does not trap focus.

Proposal Risk: 2/10 - Wiring the existing Cancel ref and an initial focus target through the panel's established hooks leaves the selection state machine untouched, so the residual risk is limited to picking a starting control consistent with the approve and ask branches.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2257 "handle keyboard focus for the choice form". In web/src/shared/questions/QuestionPanel.tsx, the choose branch added by this commit renders ChoiceQuestionForm without a ref to the panel's cancelRef, and the mount-time focus effect still runs only for approve questions; extend that effect to cover choose and pass a callback or forwarded ref so the form's Cancel button becomes the cancel target, or focus the default-selected radio when one exists so focus starts on a visible control. In web/src/shared/questions/ChoiceQuestionForm.tsx, accept that ref and attach it to the Cancel button without changing the selection or custom-text state, keeping the component presentational. In web/src/shared/questions/QuestionPanel.test.tsx, add cases asserting that a choose panel focuses a defined control on open and that focusCancel from the imperative handle lands on the form's Cancel button, mirroring the existing ask and approve focus cases. The existing focus tests for ask, approve, and the imperative handle, plus the choice form's selection tests, must keep passing; take care not to steal focus from an unrelated control when the panel mounts.


* Keep Shift+Tab inside the choice form instead of letting application section navigation pull focus out

Existing Issue: The form rendered for choose questions lacks the data-claims-shift-tab marker carried by the ask form and the approve option row, so a backward Tab on any choice radio, the custom field, or the form's buttons is captured by the app-wide section navigator instead of staying in the panel. Severity: 5/10

Existing Risk: 5/10 - A keyboard user working backward through a choice question jumps to a different application section mid-question, losing focus without answering or cancelling, and the panel offers no local wrap-around to bring focus back.

Proposal Risk: 2/10 - Adding the same claim marker the other two question forms already use is a local attribute change, so the remaining risk is that backward focus still leaves the form at its first control unless a local wrap-around handler is added, which a test can pin.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2257 "keep Shift+Tab inside the choice form". In web/src/shared/questions/ChoiceQuestionForm.tsx, mark the form element with data-claims-shift-tab the way the ask form and the approve options row do in web/src/shared/questions/QuestionPanel.tsx, so useSectionNav's capture-phase listener stands down for keys landing on the choice controls. Because the global handler then steps aside without providing local behavior, add a keydown handler on the form that wraps Shift+Tab from the first focusable control back to the last and Tab from the last forward to the first, following the roving pattern in web/src/shared/questions/useAnswerButtons.ts, or reuse that hook if its button-row shape fits the radio group and custom field. In web/src/shared/questions/QuestionPanel.test.tsx, add a test that registers a global keydown listener as the Escape tests do, dispatches Shift+Tab from inside the choice form, and asserts the global listener does not receive it and focus stays within the form's controls. The existing section-navigation and QuestionPanel keyboard tests must keep passing.
