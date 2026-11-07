# Suppress tab-switch focus during the walk

**Complexity: 2/10** — one optional ref parameter and one early return in a 35-line hook, one extra argument at the App call site, and one new hook test; the walk flag it reads already exists and is already set and cleared by subplan `06`. No new state machine, no new UI.

## Goal

Stop `useFocusOnTabSwitch` from moving focus off a walk dialog when the server switches to the tab the walk just revealed. The dialog must own focus on every step.

Why it happens today: each walk step's `SaveChangesDialog` is keyed by label (`web/src/unsaved-work/CloseSaveGuard.tsx:67`, `key={request.label}`), so it remounts per step and takes focus on mount (`web/src/shared/useDialogKeyboard.ts:35`, `dialogRef.current?.focus();`). The `focusTab` the walk sent just before arrives back as an `activeTab` change one round trip later, and the hook's effect then focuses the new tab's terminal or command line, pulling focus out of the dialog.

## Dependencies and ordering

This subplan depends on `06-quit-walk-guard` (complete) for `saveWalkOpenRef` and for the code that sets and clears it; none of that code changes here. It lands before `08-quit-entry-and-cmd-w` makes the walk reachable, so the feature never ships a step where the tab-switch hook steals focus from the dialog. The three file changes below can land in one commit; the hook change must exist before the App argument is added or typecheck fails, so if split, change the hook first.

## Design decisions

- `useFocusOnTabSwitch` (`web/src/useFocusOnTabSwitch.ts:22`) gains a sixth optional parameter, `suppressRef?: React.RefObject<boolean>`. Use the same `React.RefObject<boolean>` type the guard already uses for this ref (`web/src/unsaved-work/CloseSaveGuard.tsx:15`, `saveWalkOpenRef?: React.RefObject<boolean>;`); the file's existing `import type React from 'react';` covers it, so no new import.
- At the very top of the effect, before the hidden/dock check, the pending-question check, or `focusCenterVisibleTab`, return when `suppressRef?.current` is true. No focus target is touched — not the harness handle, not the command line, not the question panel's `focusCancel`.
- The effect's dependency array stays `[activeTab]` and keeps its existing `eslint-disable-next-line react-hooks/exhaustive-deps` comment (`web/src/useFocusOnTabSwitch.ts:33`). Do not add `suppressRef` to the deps: the ref is read at effect time, not subscribed to. If `activeTab` changes while suppression is true, nothing focuses; flipping the ref to false focuses nothing by itself; the next `activeTab` change after the ref goes false behaves normally.
- When the parameter is absent, behavior is exactly today's. Existing callers and tests do not pass it.
- `focusCenterVisibleTab` is not touched and gets no suppression. Its other caller, `useSectionNav` at `web/src/App.tsx:171`, is a deliberate user move between sections and must keep working during a walk exactly as today.
- `App.tsx` passes `saveWalkOpenRef` (declared at `web/src/App.tsx:128`, `const saveWalkOpenRef = useRef(false);`) as the sixth argument. This is the same ref object App already hands to `AppMain` and on to `CloseSaveGuard`, so the hook and the walk read and write one flag. Keep the call on its single line so `App.tsx` (about 174 counted lines of the 200 `max-lines` cap) does not grow.
- The flag's lifecycle is owned entirely by subplan `06` and is not changed here. As the code stands in `web/src/unsaved-work/useQuitWalk.ts`:
  - it goes true in `start` (`useQuitWalk.ts:68`, `saveWalkOpenRef.current = true;`) before `reveal(first)` sends the first `focusTab`, so the first switch is already suppressed;
  - it stays true across every advance, including a save in flight;
  - it goes false on completion (`useQuitWalk.ts:55`, before `dismiss()` and `onQuit()`), on a failed save (`useQuitWalk.ts:93`, before `attemptHandle.focus()`), and on Cancel (`useQuitWalk.ts:115`, before `handle.focus()`);
  - it also goes false when a single-tab close request replaces the walk (`CloseSaveGuard.tsx:47`, `effectiveWalkOpenRef.current = false;` before `openClose`);
  - Save or Cancel on a tab that has disappeared advances rather than ending the walk, so the flag correctly stays true.
  The "false before `focus()`" order on Cancel and failure is what lets the explicit tab focus be the last word; it is already in place, so the implementer only verifies it, not adds it.
- A tab revealed through `revealDocked` (a sidebar-docked tab) does not change `activeTab`, so the hook never runs for it; suppression is irrelevant there and needs no special case.
- The dialog's key trap keeps working either way because `useDialogKeyboard` listens on the window in capture phase (`web/src/shared/useDialogKeyboard.ts:44`). This change is about focus only, not about which keys are swallowed.
- Deliberate corner from the source plan: if `Escape` lands before the server's switch to that tab arrives, the late switch runs the hook unsuppressed and focus ends in the command line rather than the tab. The tab is still current and its edits are intact. If that shows up in practice, the fix is to keep suppression up until the next `activeTab` change after a Cancel; this subplan does not add that mechanism.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Tab-switch focus hook | `web/src/useFocusOnTabSwitch.ts:22` (`useFocusOnTabSwitch`), with the effect at line 29 (`useEffect(() => {`) | One optional parameter and one early return. |
| Center focus helper | `web/src/useFocusOnTabSwitch.ts:9` (`focusCenterVisibleTab`) | Unchanged. Still the fallback when suppression is false, and still used directly by `useSectionNav`. |
| App call site | `web/src/App.tsx:169` (`useFocusOnTabSwitch(activeTab, currentRef, harnessHandles, inputReference, questionPanelRef);`) | Gains `saveWalkOpenRef` as the sixth argument. |
| Walk flag | `web/src/App.tsx:128` (`saveWalkOpenRef`), passed through `web/src/AppMain.tsx:113` to `CloseSaveGuard` | Read by the hook; no new ref. |
| Walk flag owner | `web/src/unsaved-work/useQuitWalk.ts` (`start`, `advance`, `save`, `cancel`) and `web/src/unsaved-work/CloseSaveGuard.tsx:47` | Already sets and clears the flag as listed above; unchanged. |
| Dialog takes focus per step | `web/src/shared/useDialogKeyboard.ts:35` plus `key={request.label}` at `CloseSaveGuard.tsx:67` | The focus this subplan protects; unchanged. |
| Hook test style | `web/src/useFocusOnTabSwitch.test.ts` (`refOf`, `noQuestionPanel`, `renderHook` with `rerender({ activeTab })` as in the "re-focuses only when activeTab changes" case) | One new case in the same file, built from the same helpers. |

## Proposed changes

- In `web/src/useFocusOnTabSwitch.ts`, add the optional `suppressRef` parameter and the early return described above. Extend the comment above the hook by one line saying the walk's ref suppresses it.
- In `web/src/App.tsx`, pass `saveWalkOpenRef` as the sixth argument to `useFocusOnTabSwitch` at line 169.
- In `web/src/useFocusOnTabSwitch.test.ts`, add the suppression case. Leave the five existing cases exactly as they are, with no `suppressRef` argument; that is what proves the parameter is optional.

No other file changes. `useQuitWalk.ts`, `CloseSaveGuard.tsx`, and `AppMain.tsx` are read-only for this subplan.

## Tests

One new `it` in `web/src/useFocusOnTabSwitch.test.ts`, using `renderHook` with an `activeTab` prop and `rerender` like the existing "re-focuses only when activeTab changes" case, with separate `vi.fn()` mocks for the harness handle's `focus`, the command line's `focus`, and the question panel's `focusCancel`, and a `suppressRef` built with `refOf(true)`:

1. Mount with `activeTab: 0` and a current tab that has a harness PTY and a `pendingQuestion` (it would normally call `focusCancel`). Assert all three mocks are uncalled — this proves the early return sits before the pending-question check, not just before `focusCenterVisibleTab`.
2. Set `currentRef.current` to a plain tab (`view: undefined`, which would normally focus the command line) and `rerender({ activeTab: 1 })`. Assert all three mocks are still uncalled.
3. Set `suppressRef.current = false` and `rerender({ activeTab: 1 })` (same tab). Assert all three are still uncalled — clearing the ref does not focus on its own.
4. Change to a harness-PTY tab with no pending question and `rerender({ activeTab: 2 })`. Assert the harness `focus` was called once and the other two are uncalled — the ref is read live and suppression is not permanent.

The existing five cases — harness focus, command-line focus, hidden/absent center, only-on-activeTab-change, and pending-question focus — pass unchanged. The App-level tests (`web/src/App.test.tsx`, `web/src/App.launch-focus.test.tsx`) run with the flag false and must also pass unchanged; there is no new App-level test, since the wiring is one argument checked by typecheck and the manual run below.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Manual check after subplan `08` makes the walk reachable: with two dirty tabs, trigger `quit`; each time the walk switches tabs, focus stays on the dialog and the arrow keys/`y`/`n` keep working. Press `Escape` and confirm focus lands in the tab that was being asked about, at its cursor. Then, with no walk open, switch tabs normally and confirm the terminal or command line still takes focus.

## Out of scope

- No change to Cmd+W or `useCmdWRefs`; that is subplan `08`.
- No quit entry point wiring (`quitWalkRef` callers); that is subplan `08`.
- No spec or user-docs updates; that is subplan `09`.
- No change to `useSectionNav`, `focusCenterVisibleTab`, or the pending-question focus behavior.
- No change to the walk's reveal or save handlers, or to where `saveWalkOpenRef` is set and cleared.
- No fix for the Escape-before-switch corner described above.
- No new key binding.
