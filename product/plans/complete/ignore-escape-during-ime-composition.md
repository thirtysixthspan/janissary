# Ignore Escape during IME composition in the question panel

**Complexity: 2/10** — 1 added line, 1 production file, 4 requirements, 6 scenarios (p=3.88)

## Goal

An input-method user composing text in a free-text question panel presses Escape to abandon the half-composed character. Today the panel treats that keydown as a cancellation, sends a null answer, and discards the answer in progress with no way to undo it. The panel should ignore Escape keydowns that belong to a composition while keeping ordinary Escape cancellation exactly as it is.

## Requirements

1. "Escape used to dismiss a composition does not discard a pending free-text answer." When a keydown on the ask panel is marked `isComposing`, no `answerQuestion` message is sent.
2. "returning early when `event.nativeEvent.isComposing` is true before calling `respond(null)` or stopping propagation." A composing Escape must still reach ancestor listeners; the panel does not call `stopPropagation` for it.
3. "treat the browser's keyCode 229 composition signal the same way." When a keydown on the ask panel carries native `keyCode` 229, no `answerQuestion` message is sent.
4. "treat the browser's keyCode 229 composition signal the same way" for propagation: a keyCode-229 Escape also reaches ancestor listeners without being stopped.

## Design decisions

- Put the composition guard at the top of the existing `div.question-panel-content` `onKeyDown`, before the `event.key === 'Escape'` branch, matching the order in `handleModelSearchKey` (Assumption 1).
- Check `event.nativeEvent.isComposing` and `event.nativeEvent.keyCode === 229` in one early return. The first is the signal the app already uses; the second covers browsers that report composition only through the legacy numeric code, as the review finding requires (Assumption 2).
- Leave `respond`, the ask form's `onSubmit`, and the input's `onChange` untouched. The composition guard changes only which keydowns reach the Escape branch (Assumption 3).
- Add new test rows beside the existing Escape table rather than changing that table, so the plain-Escape cancellation and stop-propagation assertions remain byte-for-byte the same.

## Preserved behavior

1. A genuine Escape on an ask or approval question sends `answer: null` and stops propagation. It must not send a different answer or let the key reach a window-level listener that would act on it. Pinned by `Escape on a $kind question sends answer: null and stops propagation`.
2. Typing into the free-text field and submitting still sends the typed answer. The composition guard must not clear, replace, or suppress characters typed into the field. Pinned by `renders a text input and sends the typed answer`.
3. The Cancel button still sends the null answer. The guard must not disable or alter that explicit cancellation path. Pinned by `sends the cancel marker`.

## Assumptions

1. `web/src/shared/model-search/model-search-keys.ts:67` establishes the app's existing composition check. Quote: `if (event.nativeEvent.isComposing) return;`.
2. `web/src/shared/questions/QuestionPanel.tsx:44` is the single panel-level keydown handler that cancels on Escape. Quote: `onKeyDown={(event) => {`.
3. `web/src/shared/questions/QuestionPanel.tsx:64` holds the free-text input's change path, which this fix does not touch. Quote: `onChange={(event) => setAnswer(event.target.value)}`.
4. `web/src/shared/model-search/ModelSearchInput.test.tsx:469` shows composing keydowns are representable with `fireEvent.keyDown`. Quote: `fireEvent.keyDown(field(), { key: 'Escape', isComposing: true })`.

## Existing functionality

1. `web/src/shared/model-search/model-search-keys.ts:67` supplies the precedent for ignoring native composition keydowns.
2. `web/src/shared/questions/QuestionPanel.tsx:33` supplies `respond(value)`, the route by which the panel answers or cancels a question.
3. `web/src/shared/questions/QuestionPanel.test.tsx:70` supplies the existing parameterized Escape table the new composition rows sit beside.

## Implementation steps

1. In `web/src/shared/questions/QuestionPanel.tsx`, add an early return at the top of the `question-panel-content` wrapper's `onKeyDown` for keydowns whose native event is composing or reports keyCode 229. Leave the `event.key !== 'Escape'` check, `respond(null)`, `preventDefault()`, and `stopPropagation()` in their current order below it. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. In `web/src/shared/questions/QuestionPanel.test.tsx`, add a parameterized table next to the existing Escape table with two ask-textbox rows: one firing `keyDown` with `key: 'Escape'` and `isComposing: true`, one firing it with `key: 'Escape'` and `keyCode: 229`. Assert no `answerQuestion` message is sent for either, and that the keydown still reaches a `globalThis` listener. Leave the existing Escape table and its stop-propagation assertion unchanged. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The free-text field, Submit button, and Cancel button keep their current placement, labels, and focus behavior.
2. During a composition, Escape dismisses the composition only: the panel stays open with the typed text still in the field, and no cancellation result appears.
3. Escape with no composition in progress keeps closing the panel through the existing cancellation path.

## Tests

- `web/src/shared/questions/QuestionPanel.test.tsx`: composing Escape on the ask textbox sends no answer and does not stop propagation, covering requirements 1 and 2.
- `web/src/shared/questions/QuestionPanel.test.tsx`: Escape with native keyCode 229 on the ask textbox sends no answer and does not stop propagation, covering requirements 3 and 4.
- Leave the existing Escape table, typed-answer test, and cancel-marker test passing unchanged, covering the preserved behaviors.

## Out of scope

- Changing the free-text input's `onChange` path or the form's submit handling.
- Changing the question protocol, server-side cancellation state, or the null-answer result text.
- Adding IME guards to other panels, to `ModalDialog`, or to window-level key handlers.
- Editing the pull request description, help pages, or user and developer documentation.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, type `question ask "Port?"` on a tab's command line, focus the answer field, begin composing a character with an input method, and press Escape to dismiss the composition. The panel must remain open with whatever text was already typed still in the field, and the command entry must not finish with `Question cancelled.`. Press Escape again with no composition in progress: the panel must close and the entry must finish with `Question cancelled.`. A panel that vanishes on the first Escape, or a second Escape that leaves it open, is a failure.
