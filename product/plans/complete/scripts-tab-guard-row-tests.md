# Scripts tab keyboard guard: pin the row clause and the header-button movement rule

## Problem

The keyboard-ownership guard `ownsKey` in `web/src/plugins/scripts/ScriptsTab.tsx` (added by commit `768d060c`) has two branches that no test exercises.

The first is the row clause, `event.target.closest('.scripts-row') !== null`. It lets a keydown whose target is a row element act on the list. A later edit that drops this clause, or renames the `scripts-row` class the clause matches, would leave Enter and the movement keys on a focused row dead while every test stays green.

The second is the rejection of movement keys when a header button has focus. The guard returns early for any target that is neither the container nor a row, so ArrowUp, ArrowDown, Home, and End pressed on the `New script` button do not move the selection. This is the deliberate trade-off the repair plan records, and nothing pins it.

Verified against the code. `ownsKey` is at `ScriptsTab.tsx:8-11`, and `onKeyDown` calls it first at `ScriptsTab.tsx:45-46`. `ScriptRows.tsx` renders each row as a `div.scripts-row` with no keydown handler of its own, so a keydown on a row reaches only the container's guard. The repair commit's only new test presses Enter on the plus button, which pins the Enter rejection and nothing else. No existing test fires a keydown on a `.scripts-row` element, and no existing test fires a movement key on a button.

## Complexity

1/10: three new test cases in one existing test file, with no source change.

## Solution

Add three test cases to `web/src/plugins/scripts/ScriptsTab.test.tsx`. Each case drives the real component through the guard and asserts behavior the current guard already produces, so the suite passes against the current code. No production file changes.

1. A keydown on a row element acts on the list. Clicking row `b` selects it, then `fireEvent.keyDown` with Enter on the row element itself must send `open` with `{ name: 'b' }`.
2. A keydown on a row element moves the selection. Clicking row `a` selects it, then `fireEvent.keyDown` with ArrowDown on the row element must move the selection to `b`.
3. A movement key on a focused header button is rejected. Clicking row `b` selects it, the test focuses the `New script` button, and `fireEvent.keyDown` with ArrowDown, ArrowUp, Home, and End on that button must each return `true` (not prevented) and leave the selection on `b`.

A small helper, `rowElement(name)`, returns the `.scripts-row` element for a row name, using `screen.getByText(name).closest('.scripts-row')`. It sits beside the existing `listedNames` and `selectedName` helpers.

## Failure without the guard

The task asks that each new test fail when the guard is removed. Read literally, that cannot hold for the two row tests: with no guard at all, a row keydown is also handled and produces the same result, so those tests would still pass. Each test is therefore tied to the branch it pins.

- Test 1 pins the row clause. Without the row clause, `ownsKey` returns false for the row target, `onKeyDown` returns before `openRow`, and `expect(intent).toHaveBeenCalledWith('open', { name: 'b' })` fails.
- Test 2 pins the row clause for movement. Without the row clause, the row keydown returns early, the selection stays on `a`, and `expect(selectedName(container)).toBe('b')` fails.
- Test 3 pins the rejection. Without the guard, or with the guard widened to accept any target, the ArrowDown keydown on the button moves the selection from `b` to `c`, so the first `expect(selectedName(container)).toBe('b')` fails. The same keydown would also call `preventDefault`, so the `toBe(true)` return check fails too.

Removing the row clause does not affect any existing assertion, because every existing keyboard test fires on the container element. These three cases are the only tests that pin the row branch and the header-button branch.

## Changes

### `web/src/plugins/scripts/ScriptsTab.test.tsx`
- Add the `rowElement` helper beside `selectedName`.
- Add test 1 to the `ScriptsTab selection and open` block, after the plus-button test.
- Add tests 2 and 3 to the `ScriptsTab keyboard movement` block, after the Delete and Backspace test.
- Leave every existing test and assertion unchanged.

### `web/src/plugins/scripts/ScriptsTab.tsx` and `web/src/plugins/scripts/scripts-keys.ts`
- No change. The guard and the key mapping are already correct for these cases.

## Tests

Test names are descriptive, and each case uses `fireEvent` on the element that the keydown targets, matching the existing keyboard tests.

- `sends open with the row name on Enter pressed on that row` (selection and open block).
- `moves the selection with ArrowDown pressed on a row` (keyboard movement block).
- `leaves the selection in place on arrow, Home, and End keys pressed on the focused New script button` (keyboard movement block).

## Spec

No change. `product/specs/scripts-tab.md` does not exist yet. Subplan `product/plans/draft/09-scripts-tab-specs-and-docs.md` writes it, including the keyboard section, and the guard behavior in this plan is recorded there when that subplan runs.

## Docs

None needed. `help.md` and `documentation/user-documentation/` do not describe the scripts tab or its keyboard behavior.

## Out of scope

- Any change to `ScriptsTab.tsx`, `scripts-keys.ts`, or `ScriptRows.tsx`, including the guard's shape.
- The schedules tab, which has the same container shape and is recorded in `product/plans/complete/scripts-tab-keydown-target.md` and `product/plans/complete/scripts-schedules-keyboard-divergence.md`.
- Tests for Delete and Backspace from a header button, and for keys other than the movement and open keys.
