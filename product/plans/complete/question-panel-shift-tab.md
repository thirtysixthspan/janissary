# Keep Shift+Tab inside a pending question panel

**Complexity: 3/10** — two small source edits and a new escape-hatch use, following a pattern the editor tab already established. The only judgment call is where Shift+Tab from the free-text Answer field should land, since the spec's button cycle does not include the field.

## Root cause

`useSectionNav` in `web/src/useSectionNav.ts` registers its Shift+Tab handler on `globalThis` in the capture phase. It stands down only when `isModalOpen()` is true or when the event target itself matches `[data-claims-shift-tab]`. `QuestionPanel` in `web/src/QuestionPanel.tsx` renders `ModalDialog` with `modal={false}`, which never calls `openModal()`, so `isModalOpen()` stays false while a question is pending. None of the panel's controls carry `data-claims-shift-tab`. So the capture listener runs first, calls `preventDefault()` and `stopPropagation()`, and moves focus to the next application section. The panel's own roving handler (`useAnswerButtons` in `web/src/useAnswerButtons.ts`, attached to `.question-panel-options` and `.modal-actions`) never sees the key.

The free-text Answer field has a second gap: it sits outside `.modal-actions`, so even with the section listener out of the way, Shift+Tab there would fall to the browser's default traversal and leave the panel backward.

## Correct behavior

From `product/specs/agent-questions.md`: Tab moves forward between the panel's buttons, wrapping from the last to the first instead of leaving the panel, and "Shift+Tab moves backward the same way, wrapping from the first to the last". From the free-text Answer field, which precedes the first button, Shift+Tab wraps to the last button, **Cancel**, so focus stays inside the panel. Outside the panel (the command line, a sidebar), Shift+Tab keeps cycling application sections while a question is pending. The panel stays non-modal.

## Reproduction

Unit: `web/src/useSectionNav.question.test.tsx` mounts `QuestionPanel` beside `useSectionNav` the way `App` does. Against the unfixed code, four of its five cases fail: Shift+Tab from `Cancel` leaves focus on `Cancel` (the mocked `focusCenter` ran instead of the panel handler), from the first option focus stays on `yes`, and from the Answer field focus stays on the field.

Live: a scratch instance built from `master@55158ecc`, driven by `temp/fix-a-bug-drivers/verify.mjs`. After `question approve "Ship it?" yes no`, focus starts on `Cancel`; Shift+Tab moved focus to the `textarea` inside `.command`. The same happened from `yes`. After `question ask "Your name?"`, Shift+Tab from the Answer field, from `Cancel`, and from `Submit` each landed in the command line `textarea`.

## Approach

1. Widen `claimsShiftTab` in `web/src/useSectionNav.ts` from `target.matches(...)` to `target.closest(...)`, so an element claims the chord for everything inside it. The editor buffer keeps working because it carries the attribute itself. Update the hook's comment to say "inside an element marked".
2. In `web/src/QuestionPanel.tsx`, put `data-claims-shift-tab` on the two containers that hold the panel's controls: the `.question-panel-form` (Answer field plus `.modal-actions`) and the `.question-panel-options` row. The panel's title and question text hold nothing focusable, so the claim is no broader than the controls.
3. Add a second handler to `useAnswerButtons`, `onFieldKeyDown`, for a field that precedes the row: Shift+Tab prevents the default, moves the roving index to the last button, and focuses it. Every other key is left alone, so typing and caret movement in the field are unaffected, and plain Tab still reaches `Submit` by the browser's own traversal. Wire it to the Answer input.

Rejected: calling `openModal()` for a question panel. That would make Shift+Tab stand down everywhere, including from the command line, and would contradict the spec's non-modal promise. Also rejected: handling the chord inside `useSectionNav` by checking for `.question-panel`, which would teach a shared listener about one feature instead of using the escape hatch built for this.

## Implementation steps

1. `web/src/useSectionNav.ts`: `closest` walk and comment.
2. `web/src/useAnswerButtons.ts`: add `onFieldKeyDown`.
3. `web/src/QuestionPanel.tsx`: attributes on the form and options row; `onKeyDown={askButtons.onFieldKeyDown}` on the Answer input.
4. Unit tests: a `useSectionNav.test.ts` case for an ancestor carrying the attribute, and a `useAnswerButtons.test.ts` case for `onFieldKeyDown`.
5. Spec and docs updates (below).

## Regression test

`web/src/useSectionNav.question.test.tsx`, "Shift+Tab in a pending question panel": Shift+Tab from `Cancel` reaches the last option and stays in `.question-panel`; from the first option wraps to `Cancel`; from `Cancel` in the free-text form reaches `Submit`; from the Answer field reaches `Cancel` and stays in the panel; and from the command line with a panel pending still calls the section-nav focus. Written test-first and observed failing against the unfixed code.

## Verification

`./scripts/run.mjs check-diff` clean. Live: rebuild with the fix, start a scratch instance under `./temp/fix-a-bug/`, and rerun `temp/fix-a-bug-drivers/verify.mjs`. Expected: from `Cancel` in the approval panel focus lands on `no`; from `yes` it lands on `Cancel`; from the Answer field it lands on `Cancel`; from `Cancel` in the free-text panel it lands on `Submit`, then back to `Cancel`. Every observation reports `inPanel: true` and `inCommandLine: false`.

Outcome: verified. The driver reaches `yes` with Tab from `Cancel`, the way a user must, since clicking an option answers the question. A first run that put focus on `yes` with a programmatic `.focus()` saw Shift+Tab go to `no`, still inside the panel. That is the roving index keeping its own count instead of reading real focus, which the separate "Move focus off Submit with one Tab" backlog entry covers. It is out of scope here.

## Spec and docs

- `product/specs/agent-questions.md`: say Shift+Tab from the free-text field moves to Cancel, and that the panel's controls keep Shift+Tab ahead of section navigation.
- `product/specs/keyboard-navigation.md`: name a pending question panel as a second place Shift+Tab is left to, beside the editor buffer.
- `help.md` and `documentation/user-documentation/getting-started/keyboard.md`: both describe where Shift+Tab goes and list the editor as the only exception; add the question panel.

## Out of scope

- The second backlog bug, where Tab from `Submit` in the free-text panel stays on `Submit` because the ask row's roving index is seeded at `Cancel`. It is a separate entry and changes different behavior.
- Making the question panel modal, or any change to `ModalDialog`.
