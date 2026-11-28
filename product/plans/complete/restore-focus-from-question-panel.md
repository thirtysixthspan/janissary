# Restore terminal focus when the disappearing question panel owned it

**Complexity: 3/10** — About 30 added lines across five production files and four test scenarios (p=4.66).

## Goal

Return keyboard focus to the current harness terminal when resolving a question removes the focused panel. Leave focus where the user moved it while they were waiting.

## Requirements

1. “Track whether the disappearing question panel actually held focus” before returning focus to the current harness terminal.
2. “Respect focus that already moved away even when it now rests on the body.”
3. “Respect focus that already moved away” when another control holds focus.

## Design decisions

- Capture the focused element in the panel's layout cleanup before React removes its DOM node. The document body can already be focused for other reasons by the time the app observes the removal.
- Pass the reported ownership through the existing centre panel wiring. The app still checks that the question disappeared from the same current harness tab and that no control took focus afterward.

## Preserved behavior

1. Switching to a tab with a pending question focuses Cancel without focusing the terminal. The existing `focuses the question dialog Cancel button instead when the active tab has a pending question` test in `web/src/useFocusOnTabSwitch.test.ts` covers this path.
2. A new free-text question focuses its text input without focusing Cancel. The existing `focuses the text input on render for an ask question` test in `web/src/shared/questions/QuestionPanel.test.tsx` covers this path.

## Assumptions

1. `web/src/MountedViewLayers.tsx:153` renders the centre panel only while `current?.pendingQuestion` exists.

## Existing functionality

1. `web/src/shared/ModalDialog.tsx:4` accepts a `dialogRef` for the containing dialog node.
2. `web/src/useQuestionFocusReturn.ts:23` calls `focusCenterVisibleTab` for the current harness terminal.

## Implementation steps

1. Give `QuestionPanel` an optional ownership callback and use its dialog ref during layout cleanup. Have `useQuestionFocusReturn` return the stable callback and consume the report on the next committed update. Wire the callback through `App`, `AppMain`, and `MountedViewLayers`. Include a focused comment beside the layout cleanup describing its timing. Run `$janissary/scripts/run.mjs check-diff`.
2. Exercise the hook against a mounted question panel and clarify focus on the page body in `product/specs/agent-questions.md`. Run `$janissary/scripts/run.mjs check-diff`.

## UI design

1. The current harness terminal receives focus when the focused question panel goes away.
2. If the user already left the panel, the focused control or page body keeps focus.

## Tests

1. In `web/src/useQuestionFocusReturn.test.tsx`, mount an actual question panel and verify that resolution moves focus to the current terminal when the focused panel disappears (requirement 1).
2. Blur the panel's answer field to the document body, then resolve the question and verify the body keeps focus (requirement 2).
3. Move focus to a different control, resolve the question and confirm the other control retains it (requirement 3).
4. Switch to another harness tab without a question and verify the resolution hook never directs focus there (requirement 1).

## Out of scope

Question submission, question ordering, and focus behavior for selected docked tabs.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. With a current harness tab, open a panel by asking that harness to invoke the MCP tool with an approval prompt. Activate a panel control and check that typing then reaches the harness terminal. With another question pending, move focus to the other pane's command line and withdraw the request from the harness. The cursor should remain in that command line. If it jumps to the terminal, the focus handoff is still stealing focus.
