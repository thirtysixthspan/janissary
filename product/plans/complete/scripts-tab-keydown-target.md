# Scripts tab Enter on a focused control stays with that control

## Problem

The scripts tab's container keydown handler in `web/src/plugins/scripts/ScriptsTab.tsx` runs for every keydown that bubbles to the container. It does not check the event target. The `+` button and the host split control sit inside that same container, so when a row is selected, Enter pressed on a focused `+` button reaches the handler, which sends `open` for the selected row and calls `preventDefault`. The browser's native activation of the focused button depends on that keydown not being prevented, so the button's own press never runs. The user gets a different script opened and never gets the new script they asked for.

Verified against the code: `onKeyDown` at `ScriptsTab.tsx:40-53` has no target check. The `+` button (`ScriptsTab.tsx:59`) and `capabilities.splitAction` (`ScriptsTab.tsx:62`, rendered by `web/src/shared/SplitTabButton.tsx` as a `<button>`) are both descendants of the container `div` with `onKeyDown`. The existing tests fire every keydown on the container element itself, so no test covered a keydown from a child control.

## Complexity

2/10 — one guard at the top of the keydown handler, a small helper, and one regression test.

## Solution

1. Add a module-level helper in `ScriptsTab.tsx` that says whether the tab owns a keydown. It returns true when `event.target` is the container itself (`event.currentTarget`), or when the target sits inside a row (`.scripts-row`). Those are the only two targets the handler acts on.
2. Call the helper first in `onKeyDown`. A keydown the tab does not own returns before any `preventDefault` or `stopPropagation`, so the focused control handles its own keys.
3. Leave the key-to-meaning mapping (`scripts-keys.ts`), the movement rule (`nextListSelection`), and the intents (`open` for the selected row, the movement branch) unchanged.

The check is a positive list (container or row) rather than a negative one (not a button). A future header control that needs Enter or an arrow key is then excluded by default, which matches the entry's Proposal Risk note. The check uses `closest('.scripts-row')` on the target rather than comparing the target with a particular row element, because rows are rendered by `ScriptRows.tsx` and the tab does not hold row element references.

Consequence to note: the guard applies to every key the handler owns, not only Enter. Arrow, Home, and End pressed while a header button has focus no longer move the selection, and they are no longer prevented, so they reach the page as ordinary keys. This is what "a keydown on a button or other interactive control stays with that control" means for the movement keys too. Movement with the container or a row focused is unchanged.

## Changes

### `web/src/plugins/scripts/ScriptsTab.tsx`
- Add a module-level function `ownsKey(event: React.KeyboardEvent)` that returns `event.target === event.currentTarget || (event.target instanceof Element && event.target.closest('.scripts-row') !== null)`.
- At the top of `onKeyDown`, return when `ownsKey(event)` is false, before `keyMeaning` runs.

### `web/src/plugins/scripts/ScriptsTab.test.tsx`
- Import `userEvent` from `@testing-library/user-event`, as `SearchTab.test.tsx` and `TabStrip.test.tsx` do.
- Add one test case to the `ScriptsTab selection and open` block (see Tests).

### `web/src/plugins/scripts/scripts-keys.ts`
- No change. Its mapping is the one the scripts subplan specifies. The target guard belongs in the tab.

## Tests

Add to `web/src/plugins/scripts/ScriptsTab.test.tsx`, in the `ScriptsTab selection and open` block:
- Clicking a row selects it, the test focuses the `New script` button, presses Enter with `userEvent` (which sends the keydown and then the native click that a focused button gets when its keydown is not prevented), and asserts that the `create` intent was sent with `{}` and that no `open` intent was sent.

The new case fails on the current code, where the container handler prevents the keydown and sends `open` instead, and passes after the guard. The user-event path is used rather than `fireEvent` because `fireEvent.keyDown` on a button does not activate it, so only user-event shows whether the native press still runs.

Existing assertions are unchanged. In particular, `sends open with the selected row name on Enter` (which fires on the container) and the double-click open test continue to pass unmodified.

## Spec

No change. `product/specs/scripts-tab.md` does not exist yet; subplan `product/plans/draft/09-scripts-tab-specs-and-docs.md` writes it, with a keyboard section. This fix is recorded there when 09 runs.

## Docs

None needed. `help.md` and `documentation/user-documentation/` do not describe the scripts tab or its keyboard behavior.

## Schedules tab (same shape, not changed here)

`web/src/plugins/schedules/SchedulesTab.tsx` has the same shape. Its container `onKeyDown` (lines 65-83) handles Enter on the selected row with no target check (line 78), and its `+` button (`New schedule`, lines 95-102) and the host split control are inside that same container, so Enter on a focused `+` opens the selected schedule's owner tab the same way. This entry does not edit it, and the schedules tab is outside this fix's scope. The same positive-list guard would fix it.

## Out of scope

- The schedules tab (described above).
- `scripts-keys.ts`, the key mapping, the movement rule, and the intents.
- The proposal's second test case (a click on `New script` with a row selected still sends `create`). The existing click test covers the click path, and the new case covers the keyboard path with a row selected.
- Any change to the split control or to the `+` button's own behavior.
