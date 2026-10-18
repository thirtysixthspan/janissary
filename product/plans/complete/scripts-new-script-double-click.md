# Scripts tab New script double-click creates one runscript
**Complexity: 2/10** — one handler gains a `detail` check that the row buttons already use, plus one test and one spec sentence. The server is untouched, and the single-click and keyboard paths keep their current behavior.

## Goal

A double-click on the scripts tab's + button, labelled `New script`, creates one runscript. Today each click sends its own `create` intent, so a double-click creates `untitled.rs` and `untitled-2.rs` and opens both in editor tabs. The second click of a double-click should be ignored, as the Run and Duplicate row buttons already ignore it.

## Design decisions and dependencies

- The claim in the backlog entry holds. In `web/src/plugins/scripts/ScriptsTab.tsx`, the header button's `onClick` is `createScript`, which calls `capabilities.intent('create', {})` with no check on the event. In `web/src/plugins/scripts/ScriptRowActions.tsx`, the Run and Duplicate buttons return before calling `onAction` when `event.detail > 1`.
- The fix goes in `createScript`, the handler the button already routes through. It takes the click event, returns without sending when `event.detail > 1`, and otherwise sends the same `create` intent with `{}` as before. The rule is the same one the row buttons use, so the two places read alike.
- A keyboard Enter on the focused button fires a click with `detail` 0, so it still passes the check and creates exactly one file. A single mouse click has `detail` 1 and is unchanged.
- The container's capture handler `swallowSecondClick` runs before the button's `onClick`. It acts only after a dialog has just closed (`dismissedRef`), and on this button it leaves the click alone, so it does not interfere with the new check.
- The server is not changed. `create` in `src/plugins/runscript-topic-actions.ts` and `newUntitledRunscript` in `src/schedule/system/runscript-files.ts` keep their behavior. The fix is a client guard, which is where the double-click arrives.
- The spec's Create section gets one sentence, because the behavior is user-visible. The entry asked for it, and it matches how the Row actions section already states the Run and Duplicate rule.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this plan uses it |
| --- | --- | --- |
| Row button rule | `web/src/plugins/scripts/ScriptRowActions.tsx` (line 30, `if (action !== 'delete' && event.detail > 1) return;`) | The same `detail > 1` rule is applied to the header button. The comment there names the second click, and the new comment in `ScriptsTab.tsx` follows that wording. |
| Header button | `web/src/plugins/scripts/ScriptsTab.tsx` (`createScript`, the `New script` button's `onClick`) | `createScript` gains the event parameter and the guard. Nothing else in the file changes. |
| Test helpers | `web/src/plugins/scripts/ScriptsTab.test.tsx` (`renderTab`, `fireEvent`, `screen`) | The new case uses the same helpers as the existing `New script` cases. |

## Proposed changes

- `web/src/plugins/scripts/ScriptsTab.tsx`: `createScript` takes `event: React.MouseEvent<HTMLButtonElement>`. It returns early when `event.detail > 1`. A comment above the check says that the second click of a double-click has detail 2, that New script acts on the first click only, and that this keeps a double-click to one runscript. The `create` send and its empty payload are unchanged.
- `web/src/plugins/scripts/ScriptsTab.test.tsx`: one new case in the `ScriptsTab new script button` describe, placed after the existing split-action case. It fires a click on the element labelled `New script` with `detail` 1, then another with `detail` 2, and expects the intent spy to have been called once, with `create` and `{}`. The existing cases in that describe stay as they are.
- `product/specs/scripts-tab.md`: one sentence added to the Create section, right after the sentence about two presses, stating that a double-click on the + button creates one runscript because its second click is ignored, as Run and Duplicate ignore theirs. No other sentence changes.

## Tests

- New case in `web/src/plugins/scripts/ScriptsTab.test.tsx`, under `ScriptsTab new script button`: the double-click case described above. Without the change, the `detail` 2 click reaches `createScript` and sends a second `create`, so the assertion `toHaveBeenCalledTimes(1)` fails with two calls. With the change, the second click returns early, so the spy records one call and the assertion passes.
- The existing case in the same describe, which expects a single click to send `create` with `{}`, passes unchanged, because its click has `detail` 0.
- The existing Enter case, which uses `userEvent` on the focused button and expects `create`, passes unchanged, because a keyboard click arrives with `detail` 0.

## Verification

Run `./scripts/run.mjs check-diff` after the change and after the test. All checks must pass with no existing test edited. The spec sentence is read against the handler comment and the new test, so the three say the same thing: a double-click creates one runscript.

## Out of scope

- Any server change, in `src/plugins/runscript-topic-actions.ts` or `src/schedule/system/runscript-files.ts`.
- The schedules tab's New schedule button. It has its own behavior and its own spec, and this fix does not touch it.
- The second backlog entry, which concerns the spec's Open and Clone sentences.
- Help text and user documentation. The double-click behavior is new to the spec and is not described in `help.md` or `documentation/user-documentation/`, so Step 6 needs no edit.
