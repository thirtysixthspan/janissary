# Move a question panel's Tab order from the focused button, not a separate counter

**Complexity: 2/10**. One hook in `web/src/` changes how it picks the next button, and its two call sites drop an argument. The tests carry most of the work.

## Root cause

`useAnswerButtons` in `web/src/useAnswerButtons.ts` keeps a roving index in a ref, seeded once from its `initialIndex` argument and afterwards advanced only by its own key handler. `QuestionPanel` calls `useAnswerButtons(2, 1)` for the free-text form, so the row starts out believing focus is on Cancel. But that panel opens with focus in the Answer input (`autoFocus`), and the input is a sibling of the `.modal-actions` row the handler is attached to. The first Tab out of the field is the browser's own traversal into Submit and never reaches the handler. The second Tab does, and computes `(1 + 1) % 2 === 0`, which is Submit again. Any other way focus reaches the row without the handler (a click, `focusCancel`, a programmatic focus) desyncs the counter the same way. In the approval form, focusing `No` and pressing Tab lands on `Yes` rather than Cancel.

## Correct behavior

`product/specs/agent-questions.md`, Keyboard focus and navigation: "Tab moves focus forward between the panel's buttons (each approval option, or Submit, plus Cancel), wrapping from the last button back to the first instead of leaving the panel; Shift+Tab moves backward the same way". So in a free-text panel, Tab from the Answer field reaches Submit, the next Tab reaches Cancel, and the next wraps to Submit. In either form, Tab and Shift+Tab move relative to whichever button actually has focus.

## Reproduction

The bug report reproduced it live: `question ask "Your name?"`, then four Tabs from the Answer field gave Submit, Submit, Cancel, Submit instead of Submit, Cancel, Submit, Cancel. New cases in `web/src/QuestionPanel.test.tsx`, written before the fix, fail against the unfixed code:

- "moves from Submit to Cancel with one Tab after tabbing out of the answer field, then wraps": after the first Tab reaches Submit, the second leaves focus on Submit (the assertion that Cancel has focus fails).
- "continues from a clicked button rather than from where Tab last left the row": in an approval panel with `Yes`, `No`, and Cancel, focusing `No` and pressing Tab does not reach Cancel.

## Approach

`useAnswerButtons` stops keeping a counter. The key handler finds which of its button refs is the event's target (the handler sits on the row, so the target is the focused button) and moves one step from there, wrapping. If the target is somehow none of them, forward goes to the first button and backward to the last. `onFieldKeyDown` keeps moving Shift+Tab from the field to the last button, now without writing an index. The `initialIndex` argument goes away because nothing reads it: the approval form's initial focus on Cancel is already set by `QuestionPanel`'s own effect, and the free-text form's by `autoFocus`.

Rejected: seeding the free-text row at index 0. It fixes the reported sequence but leaves every other desync (a click, `focusCancel`) in place.

## Implementation steps

1. `web/src/useAnswerButtons.ts`: derive the current index from the event target; drop the counter and `initialIndex`.
2. `web/src/QuestionPanel.tsx`: call `useAnswerButtons(optionCount)` and `useAnswerButtons(2)`.
3. `web/src/useAnswerButtons.test.ts`: key events carry a `target`; the "starts from the given initial index" case becomes a case that the next button follows whichever button the key landed on, plus the fallback for a target outside the row.
4. `web/src/QuestionPanel.test.tsx`: the two replication cases above.

## Regression test

`web/src/QuestionPanel.test.tsx` › "moves from Submit to Cancel with one Tab after tabbing out of the answer field, then wraps", and "continues from a clicked button rather than from where Tab last left the row".

## Verification

Run `./scripts/run.mjs check-diff`. Live: build the fix, start a scratch instance under `./temp/fix-a-bug/`, and drive it with `./temp/fix-a-bug-drivers/verify.mjs`. The driver types `question ask "Your name?"` in the agent tab, confirms focus is in the Answer field, presses Tab four times, and records the focused element's label after each press. Expected: Submit, Cancel, Submit, Cancel. It then answers with Cancel, runs `question approve "Pick a colour" red green blue`, and walks Tab from Cancel to confirm the approval order is unchanged: red, green, blue, Cancel, red.

Outcome: verified. The free-text panel opened with focus on `Answer`, and four Tabs landed on Submit, Cancel, Submit, Cancel. The approval panel opened on Cancel, and five Tabs landed on red, green, blue, Cancel, red.

## Spec and docs

The spec already describes the correct behavior, so it needs no change. `documentation/user-documentation/advanced-agents/agent-questions.md` describes the same Tab order and already matches; `help.md` doesn't describe it.

## Out of scope

- Section navigation's Shift+Tab handling around the panel.
- The panel's visual layout.
