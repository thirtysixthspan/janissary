<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the documentation debt by recording the new Escape-to-cancel shortcut in the question panel's keyboard spec and in-app key help.

Existing Issue: The question panel now cancels on Escape, but the Keyboard focus and navigation section of product/specs/agent-questions.md lists only Tab, Shift+Tab, and the arrow keys, and help/keys.md carries no question-panel Escape row, so neither authoritative keyboard reference mentions the new cancellation input. Severity: 3/10

Existing Risk: 3/10 - A developer or user consulting the spec or in-app help to learn the panel's keys never learns that Escape cancels, so the documented keyboard contract silently diverges from the shipped one and a later change can reintroduce or contradict the shortcut without any reference to check.

Proposal Risk: 1/10 - Updating prose in two reference documents cannot change runtime behavior, so the only residual risk is wording drift if the shortcut is changed again without updating the same two pages.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2257 "document Escape-to-cancel for the question panel". In product/specs/agent-questions.md, add a sentence to the Keyboard focus and navigation section stating that pressing Escape while focus is inside a pending question panel cancels the question by sending the null answer, that the shortcut is scoped to focus inside the panel so the panel stays non-modal, and that the key is stopped from reaching app-wide handlers. In help/keys.md, add a question-panel controls entry, or extend the existing Shift+Tab note, with an `Escape` row describing the same cancellation. Keep both statements limited to what web/src/shared/questions/QuestionPanel.tsx actually implements and do not change the component. The Escape table in web/src/shared/questions/QuestionPanel.test.tsx pins the behavior these documents will describe and must keep passing untouched.

* Handle the IME-composition case so Escape used to dismiss a composition does not discard a pending free-text answer.

Existing Issue: The new Escape handler on the panel wrapper checks only event.key and calls respond(null) for any Escape, including a keydown marked isComposing from an input method, so dismissing an IME composition in an ask panel cancels the whole question and discards the text typed so far. Severity: 4/10

Existing Risk: 4/10 - An input-method user who presses Escape to abandon a half-composed character instead loses the entire answer and sends a null response to the waiting agent, and that cancellation cannot be undone once the question resolves.

Proposal Risk: 2/10 - After the guard a genuine Escape still cancels exactly as before and IME users can compose normally, so the residual risk is limited to browsers that signal composition only through keyCode 229 rather than isComposing, which a keyCode fallback covers.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2257 "ignore Escape during IME composition in the question panel". In web/src/shared/questions/QuestionPanel.tsx, guard the wrapper's onKeyDown with the same input-method check used in web/src/shared/model-search/model-search-keys.ts, returning early when event.nativeEvent.isComposing is true before calling respond(null) or stopping propagation, and treat the browser's keyCode 229 composition signal the same way. Extend web/src/shared/questions/QuestionPanel.test.tsx's Escape table with a case that fires keyDown with isComposing true on the ask textbox and asserts send is not called, plus a case for keyCode 229, while leaving the existing plain-Escape cases and the stop-propagation assertion unchanged. Do not alter the free-text input's onChange path; the existing typed-answer test covers it and must keep passing.
