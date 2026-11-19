# Model search 10: Launch dialogs can yield a key to a focused control

**Complexity: 2/10** — ~5 added lines, 1 file edited, 3 requirements, 2 test scenarios (p=3.65)

Run order: 10 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on no earlier subplan's code. It runs after `product/plans/ready/roles-model-search-input-9-launch-view-role-entries.md` by series order and must land before subplan 11 consumes it.

The New harness dialog reads Return and Escape through `useDialogKeyboard`'s window listener in the **capture** phase, before the focused input sees them. Once the dialog's Model field has a dropdown (subplan 11), a Return meant to accept a highlighted candidate would Create, and an Escape meant to close the dropdown would Cancel. This step gives `useLaunchDialog` a way to let such a key pass through untouched.

## Goal

Add an optional fifth argument to `useLaunchDialog` in `web/src/shared/use-launch-dialog.ts`, a `yieldsKey(event)` predicate, with tests.

## Design decisions

All of these come from the source plan.

- **An optional predicate.** `useLaunchDialog(onCancel, onCreate, canSubmit, hadRemembered, yieldsKey?)`, where `yieldsKey` is typed `(event: KeyboardEvent) => boolean`. When `yieldsKey` is given and returns true for a keydown, the hook's handler returns at once without acting and without `preventDefault` (nor `stopPropagation`, which the raw handler never calls), so the key reaches the focused input and its own handler. When it returns false, or is omitted, Escape and Enter behave exactly as today: Escape prevents default and cancels, and Enter prevents default and creates when `canSubmit` allows.
- **Checked first.** The guard is an early return at the top of the raw handler, before the `e.key === 'Escape'` and `e.key === 'Enter'` branches, so neither branch's `preventDefault`, cancel, or create runs. The predicate is consulted on every keydown, but only Enter and Escape have behavior to suppress; any other key already passes through the hook's raw handler untouched.
- **Read on every key.** `useDialogKeyboard` refreshes its handler ref on every render (`web/src/shared/useDialogKeyboard.ts:32`, `onKeyDownRef.current = …`), so the predicate passed on the latest render is the one consulted. A host that needs state newer than its last render reads it from a ref inside the predicate; subplan 11 does.
- **Other callers are unchanged.** `ScheduleDialog` (`web/src/ScheduleLaunchDialog/ScheduleDialog.tsx`), the only other caller, passes nothing.
- **The dialog's predicate is subplan 11's.** There it is "the model dropdown is open, and the key is Escape, or the key is Enter with a row highlighted". This step only adds the seam.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| The hook being changed | `useLaunchDialog` at `web/src/shared/use-launch-dialog.ts:5` | 27 lines; its raw handler at `:17` calls `preventDefault` only for Escape/Enter |
| Capture-phase listener | `useDialogKeyboard` at `web/src/shared/useDialogKeyboard.ts:27` | Raw handler form at `:32`: the handler decides what to swallow; registered with `{ capture: true }` at `:44` |
| Callers | `HarnessLaunchDialog` at `web/src/harness/HarnessLaunchDialog.tsx:66` (`useLaunchDialog(cancel, create, true, hadRemembered)`), `ScheduleDialog` at `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx:63` (`useLaunchDialog(cancel, create, canSubmit, hadRemembered)`) | Both pass four arguments today; these are the only callers |
| Existing tests | `web/src/shared/use-launch-dialog.test.tsx:6` | A `Dialog` test component wrapping the hook with `onCancel`/`onCreate` props |

## Proposed changes

- `web/src/shared/use-launch-dialog.ts` (27 lines today): add `yieldsKey` as a fifth, optional parameter typed `(event: KeyboardEvent) => boolean`, and an early return at the top of the raw handler passed to `useDialogKeyboard` when it returns true. The guard sits before the Escape and Enter branches so the yielded key is neither prevented nor acted on. Update the hook's one-line comment (`// Shared dialog keyboard wiring and remembered-submit focus behavior.`) to mention the predicate. No new module or type export; the file stays far under the 200-line `max-lines` limit.

## Tests

`web/src/shared/use-launch-dialog.test.tsx` (existing). Extend its `Dialog` test component with an optional `yieldsKey` prop passed through as the fifth argument. The existing `fireEvent.keyDown(document, …)` cases are fine for the callback assertions. For the `defaultPrevented` assertion, dispatch a cancelable `KeyboardEvent` on `globalThis` and read `event.defaultPrevented`, following `web/src/plugins/schedules/DeleteScheduleDialog.test.tsx:97` (which constructs `new KeyboardEvent('keydown', { key: …, bubbles: true, cancelable: true })`); a non-cancelable event would make that assertion vacuous.

- A `yieldsKey` returning true lets Enter and Escape through: neither create nor cancel is called, and `event.defaultPrevented` stays false.
- A `yieldsKey` returning false keeps the normal handling: Escape cancels and Enter creates.
- Omitting `yieldsKey` keeps the current behavior, which the existing cases already cover.

These unit cases prove the hook doesn't swallow the key; that the key then reaches a focused input and its own handler is exercised end to end by subplan 11's dialog tests, not here.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual: type bare `schedule` and bare `harness` and confirm Return and Escape still create and cancel in both dialogs. Neither passes `yieldsKey` yet.

## Out of scope

- Any change to `useDialogKeyboard`.
- Using the predicate in the New harness dialog (subplan 11).
- Any change to `ScheduleDialog`.
