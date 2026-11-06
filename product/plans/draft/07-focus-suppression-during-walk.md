# Suppress tab-switch focus during the walk

**Complexity: 2/10** — one optional ref parameter, one early return, one App argument, and one hook test. No new state machine, no new UI.

## Goal

Stop `useFocusOnTabSwitch` from moving focus off a walk dialog when the server switches to the tab the walk just revealed. The dialog must own focus on every step.

## Dependencies and ordering

This subplan depends on `06-quit-walk-guard` for `saveWalkOpenRef` and for the guard that sets it. It lands before `08-quit-entry-and-cmd-w` makes the walk reachable, so the feature never ships a step where the tab-switch hook steals focus from the dialog.

## Design decisions

- `useFocusOnTabSwitch` gains a sixth optional parameter, `suppressRef?: React.RefObject<boolean>`.
- At the very top of the effect, before the hidden/dock check, the pending-question check, or `focusCenterVisibleTab`, return when `suppressRef?.current` is true. No focus target is touched.
- The effect still runs only when `activeTab` changes, as today. The ref is read at effect time, not subscribed to. If `activeTab` changes while suppression is true, nothing focuses; the next `activeTab` change after the ref goes false behaves normally.
- When the parameter is absent, behavior is exactly today's. Existing callers and tests do not need to pass it.
- `App.tsx` passes `saveWalkOpenRef` as the sixth argument. It is false outside a walk and true from the moment `startQuitWalk` opens the first dialog until Cancel, a failed save, or completion clears it.
- The dialog's key trap keeps working either way because `useDialogKeyboard` listens on the window in capture phase. This change is about focus only, not about which keys are swallowed.
- On Cancel or a failed save, `useQuitWalk` sets `saveWalkOpenRef` false before calling the tab's `focus()`. That order is required so the explicit focus is the last word.
- Deliberate corner from the source plan: if `Escape` lands before the server's switch to that tab arrives, the late switch runs the hook unsuppressed and focus ends in the command line rather than the tab. The tab is still current and its edits are intact. If that shows up in practice, the fix is to keep suppression up until the next `activeTab` change after a Cancel; this subplan does not add that mechanism.
- No change to `focusCenterVisibleTab`, `useSectionNav`, or the pending-question focus path. The suppression is only the walk's.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Tab-switch focus hook | `web/src/useFocusOnTabSwitch.ts:22` (`useFocusOnTabSwitch`), with the effect at line 29 | One optional parameter and one early return. |
| Center focus helper | `web/src/useFocusOnTabSwitch.ts:9` (`focusCenterVisibleTab`) | Unchanged. It is still the fallback when suppression is false. |
| App call site | `web/src/App.tsx:165` (`useFocusOnTabSwitch(activeTab, currentRef, harnessHandles, inputReference, questionPanelRef)`) | Gains `saveWalkOpenRef` as the sixth argument. |
| Walk flag owner | `web/src/unsaved-work/useQuitWalk.ts` (from subplan `06`) | Sets `saveWalkOpenRef` true on start and false on Cancel, failure, or completion. |
| Hook test style | `web/src/useFocusOnTabSwitch.test.ts` | Existing `renderHook` cases with fake handles and refs; one new case in the same file. |

## Proposed changes

- In `web/src/useFocusOnTabSwitch.ts`, add the optional `suppressRef` parameter and the early return described above.
- In `web/src/App.tsx`, pass `saveWalkOpenRef` as the sixth argument to `useFocusOnTabSwitch`.
- In `web/src/useFocusOnTabSwitch.test.ts`, add the suppression case; leave the existing cases as they are, optionally passing a false ref where it makes the intent clearer.

No other file changes.

## Tests

In `web/src/useFocusOnTabSwitch.test.ts`:

- With a `suppressRef` whose `current` is true, a rerender that changes `activeTab` focuses nothing: the harness handle's `focus`, the command line's `focus`, and the question panel's `focusCancel` are all uncalled. Use a current tab that would normally focus a harness terminal and then change to one that would normally focus the command line, or vice versa, so the test would fail if either branch ran.
- With the same `suppressRef` flipped to false, the next `activeTab` change focuses the expected target. This proves the ref is read live and suppression is not permanent.
- The existing cases — harness focus, command-line focus, hidden/absent center, only-on-activeTab-change, and pending-question focus — pass unchanged with no `suppressRef` or with a false one.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Manual check after subplan `08` makes the walk reachable: with two dirty tabs, trigger `quit`; each time the walk switches tabs, focus stays on the dialog and the arrow keys/`y`/`n` keep working. Press `Escape` and confirm focus lands in the tab that was being asked about, at its cursor.

## Out of scope

- No change to Cmd+W or `useCmdWRefs`; that is subplan `08`.
- No change to `useSectionNav`, `focusCenterVisibleTab`, or the pending-question focus behavior.
- No change to the walk's reveal or save handlers.
- No new key binding.
