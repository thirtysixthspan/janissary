# Scripts delete dialog second click

**Complexity: 3/10**. The scripts tab container gains one capture handler for `click` and `dblclick`, one flag that the dialog's open and close paths set, and three test cases that pin the behavior.

## Goal

A double-click on the delete dialog's Delete or Cancel button closes the dialog and does nothing to the row beneath it. The second click of that double-click neither selects the row, opens it, nor presses one of its row buttons. A double-click on a row after that still selects and opens it.

## The claim, checked

The confirm path (`confirmDelete`) and the close path (`closeDelete`) in `ScriptsTab.tsx` both end in `setPendingDelete(null)`, so the dialog leaves the DOM on the first click. The row's `onClick` in `ScriptRows.tsx` calls `onSelect`, and its `onDoubleClick` calls `onOpen`, which is `openRow` and sends `open`. The entry's account holds: the second click reaches the row, and the double-click reaches its handler.

The comment in `ScriptRowActions.tsx` is right only for the row's own Delete button. That button opens the dialog, and the dialog's backdrop takes the second click. The dialog's own buttons close it before the second click arrives, so the comment does not describe them.

No existing test sends a click or double-click after a dialog close. Every existing test sends its clicks with `detail` 0, which is the testing-library default.

## Approach

Three mechanisms were considered against the real browser event order.

A flag that is checked within the same tick as the close cannot work. The dismissing click and the second click are separate input events, each dispatched in its own task. React 19 (`createRoot`) commits the state change from the first click before the next input event, so the flag would be gone by the time the second click arrives.

Stopping the event at the dialog's own elements before they unmount cannot work either. The second press targets the row beneath, since the dialog's DOM is already removed when that press arrives. No dialog element is left to stop.

A timer window of about 500 ms, as the entry proposes, works for the default double-click interval. It approximates a rule the browser already applies, though. It swallows an unrelated fresh click for the whole window, and it misses a second click on a system whose double-click interval is longer.

A global capture listener on `globalThis`, also from the entry, leaks. `.modal-backdrop` is `position: fixed; inset: 0`, so the second click may land anywhere in the window, including the shell and other tabs. The listener would swallow it there too.

The chosen mechanism uses the browser's own click count. The second click of a double-click carries `detail` 2 whatever the OS double-click interval is, because the platform counts consecutive clicks in time and position. The scripts tab container takes a capture-phase `click` and `dblclick`. While the flag is set, an event with `detail` above 1 is stopped there, so no row handler, row button handler, or header control receives it. An event with `detail` 1 or less clears the flag. The flag is set when the dialog closes and cleared when a dialog opens, so the dialog's own buttons never see a set flag.

The stop is local to the scripts tab's element. It needs no global listener, no timer, and no cleanup on unmount.

I did not run a browser. The one assumption to check by hand is that the platform's click count carries from the dialog's button to the row beneath. On macOS, which this checkout runs on, the count comes from the window server by time and position, not by element. If a browser reset the count when the target changed, the second click would arrive with `detail` 1, the stop would not fire, and the bug would remain in that browser. Nothing would regress.

## What already exists

| Piece | Where | How this fix uses it |
| --- | --- | --- |
| Confirm and close paths | `web/src/plugins/scripts/ScriptsTab.tsx` (`confirmDelete`, `closeDelete`) | `closeDelete` sets the flag, and `confirmDelete` already calls it. |
| Dialog open | `web/src/plugins/scripts/ScriptsTab.tsx` (`openDelete`) | Clears the flag, so an open dialog's buttons are never stopped. |
| Row select and open | `web/src/plugins/scripts/ScriptRows.tsx` | Unchanged. The container stop keeps those events from reaching them. |
| Run and Duplicate detail guard | `web/src/plugins/scripts/ScriptRowActions.tsx` (`onClick`) | Unchanged. |
| Dialog outside-click swallowing | `web/src/plugins/scripts/DeleteScriptDialog.tsx` | Unchanged. It covers clicks outside the dialog while it is open, so it never sees the second click. |
| Modal backdrop | `web/src/theme.css` (`.modal-backdrop`) | Why the second click can land on the row beneath. |

## Proposed changes

- `web/src/plugins/scripts/ScriptsTab.tsx`: add `const dismissedRef = useRef(false);`. `openDelete` sets it to false. `closeDelete` sets it to true. Add a handler `swallowSecondClick(event: React.MouseEvent<HTMLDivElement>)` that, when the flag is set and `event.detail` is above 1, calls `event.stopPropagation()` and returns. Otherwise it sets the flag to false. Pass the handler as `onClickCapture` and `onDoubleClickCapture` on the `.scripts-tab` container. No new module is needed; the file stays well under the 200-line limit.
- `web/src/plugins/scripts/ScriptRowActions.tsx`: correct only the comment above the Delete check. The new comment says that Delete's second click lands on the dialog backdrop only when the row's Delete button opened the dialog, and that the dialog's own buttons close it on the first click, so the second click reaches the row beneath and `ScriptsTab` ignores it. The code stays as it is.
- `web/src/plugins/scripts/ScriptsTab.test.tsx`: add a new `describe` block at the end of the file. No existing test changes.
- `product/specs/scripts-tab.md`: add one sentence to the Delete section, saying that a double-click on the dialog's Delete or Cancel button does not act on the row beneath it.

## Tests

In `web/src/plugins/scripts/ScriptsTab.test.tsx`, add `describe('ScriptsTab second click after the delete dialog closes')` with three cases.

1. `it.each(['Delete', 'Cancel'])`. Select row `a`, open the delete dialog for row `b` from its row Delete button, click the dialog's button with `detail` 1, then click row `c` with `detail` 2 and dispatch `dblclick` on `c` with `detail` 2. Expect no `open` or `execute` intent, and the selection still `a`. Without the fix, the click on `c` selects it and the `dblclick` sends `open`, so the selection and intent assertions fail. With the fix, the container stops both events.

2. Click the row Delete button of row `c` with `detail` 2 after the dialog closes by Cancel. Expect no dialog and no intent. Without the fix, the row button's `onClick` runs and opens a dialog for `c`, so the dialog assertion fails. The row button has no `detail` check of its own for Delete, which is why it needs the container stop.

3. After the dialog closes by Cancel, a click on `c` with `detail` 1 clears the flag and selects `c`. A click on `c` with `detail` 2 and a `dblclick` with `detail` 2 then send `open` for `c`. This case passes with or without the fix, because it guards the reset. Without the reset, a later double-click on a row would be swallowed for as long as no dialog opened.

The new cases pass `detail` explicitly for the second click and the `dblclick`. The testing-library default for `dblClick` has no `detail`, so the default would not reproduce the browser's second click.

## Edge cases

- A keyboard close (`y`, `n`, Escape, Enter) also sets the flag. A keyboard close produces no click, so the flag stays set until the next click. That click has `detail` 1 unless it continues a click run that began on the same spot a moment earlier. The rule is the same one the browser applies to double-clicks.
- A second click that lands outside the scripts tab, on another pane under the viewport-wide backdrop, is not stopped. The entry asks only about the row beneath. Covering other panes would take the global listener it proposed, which is the leak described above.
- Keyboard activation sends a click with `detail` 0, which clears the flag.

## Verification

Run `./scripts/run.mjs check-diff` after the code change and again after the tests. All tests must pass, and the existing tests must pass unchanged. The first case fails without the fix by reading the logic: the click on `c` runs the row's `onClick`, which changes the selection, and the `dblclick` runs its `onDoubleClick`, which sends `open`. No temporary mutation is used.

## Out of scope

- The delete dialog's keyboard contract and the shared `ConfirmDialog`, which the other pull-request entry covers.
- Second clicks that land outside the scripts tab.
- The schedules tab's dialog and rows.
- Any spec change beyond the one sentence named above.
