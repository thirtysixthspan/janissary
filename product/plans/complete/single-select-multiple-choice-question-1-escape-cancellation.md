# Cancel any question with Escape from inside its panel

**Complexity: 2/10** — ~12 added lines, 1 file, 2 requirements (p=3.63)

Source plan: `./product/plans/complete/single-select-multiple-choice-question.md`.

## Goal

A person who has a question panel open should be able to dismiss it with the Escape key, no matter which kind of question it is. Today Escape is handled only by window-level listeners in plugin tabs, so pressing it while focus sits inside a panel does not reliably cancel the question or may also trigger unrelated tab behavior. This subplan gives the panel its own Escape handler that cancels the pending question through the existing answer path and keeps the key from reaching those window listeners. It is the first, protocol-free step of the single-select feature; later subplans reuse the wrapper introduced here so the choice form inherits the same behavior.

## Requirements

1. "Escape cancels all question types while focus is inside the panel and notifies the caller that the question is cancelled." — implement this for the two kinds that exist today (`ask` and `approve`); the `choose` row joins the same handler table in `single-select-multiple-choice-question-5-choice-form-keyboard-and-focus.md`.
2. "Escape returns the existing `Question cancelled.` result." — use the existing `respond(null)` path, not a new cancellation message.

## Design decisions

- Add an `onKeyDown` to a new `div.question-panel-content` wrapper rendered inside `ModalDialog`, around the existing question text and the `ask` form / `approve` option row. Wrap first, change nothing else about the children; later subplans split these children into a scrolling body and a fixed footer.
- On Escape call the existing local `respond(null)`, then `preventDefault()` and `stopPropagation()`. Stopping propagation is what keeps a plugin tab's window-level Escape listener from also acting (Assumption 1).
- Keep `ModalDialog` untouched: it accepts only `dialogRef`, `title`, `children`, `modal`, and `className`, with no key-handler prop (Assumption 2). The wrapper belongs in `QuestionPanel`, not in the shared dialog.
- This step adds no protocol type and no new module, so it is green on its own and leaves no dangling reference.

## Preserved behavior

None found. The change adds a key handler on a new wrapper and does not alter any behavior pinned by an existing test; the named preservation tests stay passing unchanged.

## Assumptions

1. `web/src/plugins/PluginBody.tsx:173` renders a docked panel inside a plugin tab body, so a key pressed in that panel also travels through the plugin tab's ancestor handlers. Quote: `{dock !== null && active && pendingQuestion && <QuestionPanel question={pendingQuestion} client={client} />}`.
2. `web/src/plugins/pdf/usePdfKeys.ts:52` registers a global `keydown` listener that treats Escape as a zoom reset; other plugin tabs have similar listeners. A panel-local handler must stop propagation so those listeners do not also act. Quote: `globalThis.addEventListener('keydown', onKey);`.
3. `web/src/shared/ModalDialog.tsx:3` declares the props type as `{ dialogRef?, title, children, modal?, className? }` with no `onKeyDown` member. Quote: `type Properties = { ... }`.
4. `web/src/shared/questions/QuestionPanel.tsx:33` already defines `const respond = (value: string | null) => ...` sending `answerQuestion` with `{ tab, id, answer: value }`; passing `null` is the established cancellation path. Quote: `const respond = (value: string | null) => {`.

## Existing functionality

1. `src/questions.ts:3` defines `QUESTION_CANCELLED = 'Question cancelled.'`, the result the server returns for a null answer; the panel does not need a new cancellation string.
2. `web/src/shared/questions/QuestionPanel.tsx:33` provides `respond(value)`, already used by the existing Cancel buttons; Escape reuses it.
3. `src/protocol/core-rpc.ts:34` defines `answerQuestion` with `answer: string | null`; `web/src/client-params/core.ts` already accepts null, so the RPC needs no change.

## Implementation steps

1. In `web/src/shared/questions/QuestionPanel.tsx`, introduce the `div.question-panel-content` wrapper inside the `ModalDialog` children, around the question text and the current `ask`/`approve` branch. Give it an `onKeyDown` that checks `event.key === 'Escape'`, calls `respond(null)`, then `preventDefault()` and `stopPropagation()`. Keep the existing `useImperativeHandle`, focus effects, and `onBeforeRemove` layout cleanup exactly as they are. Build and prove green with `$janissary/scripts/run.mjs check-diff`.
2. Add Escape rows to `web/src/shared/questions/QuestionPanel.test.tsx` for an `ask` question and an `approve` question: focus an element inside the panel, register a `globalThis` `keydown` spy as a stand-in for a plugin tab's listener, fire `keyDown` with `key: 'Escape'`, and assert the `answerQuestion` message carries `answer: null` while the global spy is not called. Follow the file's existing `userEvent`/`fireEvent` conventions. Build and prove green with `$janissary/scripts/run.mjs check-diff`.

The wrapper is deliberately minimal so the next subplan can give it layout rules without touching the handler. Every step leaves the tree green at its own commit.

## UI design

1. Escape keeps the panel open only until the existing answer round-trip resolves; there is no new visual state.
2. A `question-panel-content` wrapper is added around the existing panel children. It has no styling in this step beyond what the existing `.modal`/`.question-panel` rules already give the children; placement and scrolling arrive in `single-select-multiple-choice-question-2-panel-placement-and-sizing.md`.

## Tests

- `web/src/shared/questions/QuestionPanel.test.tsx`: Escape on `ask` and on `approve` sends `answer: null` through `answerQuestion` and stops propagation, covering requirements 1 and 2. Add the rows to the existing Escape table so `choose` can be appended later without a second test.
- Keep the named preservation tests in that file passing untouched.

## Out of scope

- Escape behavior for `choose`, which lands with the choice form in `single-select-multiple-choice-question-5-choice-form-keyboard-and-focus.md`.
- Any change to `ModalDialog`, to the question protocol, or to server-side cancellation state.
- Changing the SDK's schema errors or the tool's error strings.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then, in the running app, issue `question ask "Port?"` on a tab's command line, click into the answer field, press Escape, and confirm the command entry finishes with `Question cancelled.` and the panel disappears. Repeat from an `approve` panel and from a docked plugin tab with focus inside the panel; the same result must appear and no plugin-level Escape action should fire. A panel that stays open, a different result text, or a second action from the plugin tab is a failure.
