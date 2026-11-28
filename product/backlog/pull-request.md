<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Handle the IME-composition case so Escape used to dismiss a composition does not discard a pending free-text answer.

Existing Issue: The new Escape handler on the panel wrapper checks only event.key and calls respond(null) for any Escape, including a keydown marked isComposing from an input method, so dismissing an IME composition in an ask panel cancels the whole question and discards the text typed so far. Severity: 4/10

Existing Risk: 4/10 - An input-method user who presses Escape to abandon a half-composed character instead loses the entire answer and sends a null response to the waiting agent, and that cancellation cannot be undone once the question resolves.

Proposal Risk: 2/10 - After the guard a genuine Escape still cancels exactly as before and IME users can compose normally, so the residual risk is limited to browsers that signal composition only through keyCode 229 rather than isComposing, which a keyCode fallback covers.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2257 "ignore Escape during IME composition in the question panel". In web/src/shared/questions/QuestionPanel.tsx, guard the wrapper's onKeyDown with the same input-method check used in web/src/shared/model-search/model-search-keys.ts, returning early when event.nativeEvent.isComposing is true before calling respond(null) or stopping propagation, and treat the browser's keyCode 229 composition signal the same way. Extend web/src/shared/questions/QuestionPanel.test.tsx's Escape table with a case that fires keyDown with isComposing true on the ask textbox and asserts send is not called, plus a case for keyCode 229, while leaving the existing plain-Escape cases and the stop-propagation assertion unchanged. Do not alter the free-text input's onChange path; the existing typed-answer test covers it and must keep passing.
