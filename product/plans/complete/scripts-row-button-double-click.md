# Scripts row button double-click
**Complexity: 2/10**. One component gains two small handlers, and five test cases pin them.

## Goal

A double-click on a row's Run or Duplicate button runs or duplicates once and opens nothing. A double-click on a row's Delete button opens the confirmation dialog and sends nothing else.

## The claim, checked

The row's `onDoubleClick` in `ScriptRows.tsx` calls `openRow`, which sends `open`. Before this fix, the row buttons in `ScriptRowActions.tsx` stopped only `click`, so a `dblclick` that starts on a button still bubbles to the row and sends `open`.

A double-click also fires two `click` events, and the second one carries `detail` 2. Before this fix, `onAction` ran on both clicks, so Run executed twice and Duplicate cloned twice. The user-event pointer code (`node_modules/@testing-library/user-event/dist/esm/system/pointer/mouse.js`) reproduces that sequence in tests: a click with detail 1, a click with detail 2, then `dblclick` on the same element. The browser behavior is the UI Events click-count rule. I did not run a browser to observe it here.

Delete does not need the same guard. Its first click opens `DeleteScriptDialog`, and the dialog's window capture listener swallows any click whose target is outside its `.modal` element. The backdrop is `position: fixed; inset: 0` with a higher z-index, so the second click lands on it and never reaches the Delete button.

## Approach

Two changes, both in `ScriptRowActions.tsx`.

Each button stops `dblclick` the same way it already stops `click`. The row then never sees a double-click that starts on a button, so `open` is not sent. The stop sits on the button, so `ScriptRows.tsx` stays as it is.

Run and Duplicate ignore a click whose `detail` is above 1, so only the first click of a double-click acts. Keyboard activation sends a click with `detail` 0, and a single mouse click has `detail` 1, so Enter and single clicks still act. Delete keeps its click path as it is, for the reason above.

One consequence to know about: a second press that the browser counts as part of the same click run is dropped. A user who wants two runs presses again after a pause, which is the behavior the entry accepted.

Two alternatives were rejected. A timestamp debounce needs timers and would drop legitimate fast repeats. A stop at the row level needs the row handler to inspect the event target, which is more change for the same result.

## What already exists

| Existing piece | Where | How this fix uses it |
| --- | --- | --- |
| Click stop on row buttons | `web/src/plugins/scripts/ScriptRowActions.tsx` (`onClick`) | Extended with the detail check. |
| Row double-click open | `web/src/plugins/scripts/ScriptRows.tsx` (`onDoubleClick`) | Unchanged. The button stop keeps the event from reaching it. |
| Dialog click swallowing | `web/src/plugins/scripts/DeleteScriptDialog.tsx` (window capture click listener) | Why Delete keeps its click path. |
| Modal backdrop | `web/src/theme.css` (`.modal-backdrop`) | The overlay that takes the second click. |
| Stop-propagation pattern | `web/src/plugins/sessions/SessionRowActions.tsx`, `web/src/plugins/schedules/SchedulesRows.tsx` | Read for the pattern and not changed. Both stop only `click`. |

## Proposed changes

- `web/src/plugins/scripts/ScriptRowActions.tsx`: each button gains an `onDoubleClick` that stops propagation. The `onClick` handler, after its existing `stopPropagation`, returns early when the action is not `delete` and `event.detail` is above 1. The code carries this comment above the check:

  ```
  // The second click of a double-click has detail 2. Run and Duplicate act on the first click only.
  // Delete needs no such check: its second click lands on the dialog backdrop, which swallows it.
  ```

  The tooltips, `data-action`, and `aria-label` stay as they are.

## Tests

In `web/src/plugins/scripts/ScriptRowActions.test.tsx`, add two `it` blocks with five cases in total. The file gains a `userEvent` import, placed as `ScriptsTab.test.tsx` places it.

- `calls onAction once for a double-click on the %s button`, for Run and Duplicate. It uses `user.dblClick` on the button and expects one call with `run` or `duplicate`. Without the detail check, the second click calls `onAction` again, so the single-call assertion fails. With the check, the second click returns early and the assertion passes.
- `stops a double-click on the %s button from reaching the row around it`, for Run, Duplicate, and Delete. A wrapping `div` carries an `onDoubleClick` spy, and the test expects the spy not to be called. Without the button's `onDoubleClick` stop, the `dblclick` bubbles to the wrapper and the spy fires. With the stop, it does not.

Every existing assertion stays untouched. The existing single-click tests use `fireEvent.click`, whose `detail` is 0, so the new check does not affect them.

The entry proposed intent-level cases in `ScriptsTab.test.tsx`, asserting `execute` and `clone` counts and the absence of `open`. That file is outside this fix's permitted edits, so those cases are not added here. The mapping from Run to `execute` and from Duplicate to `clone` is already pinned by existing tests in that file.

## Verification

Run `./scripts/run.mjs check-diff` after the change, and fix any failure before finishing. The check covers lint, typecheck, and the scripts web tests.

## Out of scope

- The schedules trash button and the session row buttons also stop only `click`. Those files are not changed here.
- The scripts-tab spec. It is written in subplan 09, so no spec file changes now.
- Help and user documentation. No page describes the row buttons' click or double-click behavior.
- Intent-level double-click tests in `ScriptsTab.test.tsx`, described above.
