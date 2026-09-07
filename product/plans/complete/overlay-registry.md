# Drive the command bar's modal overlays from one ordered registry

**Complexity: 6/10** — a new pure module holds the ordered overlay list, and the three places that restated it derive their answer from it instead. One new file and three consumers plus tests; no props are removed, no hook is collapsed, no component is restructured.

## Goal

Make "which overlay is open, and which one wins" a question with one answer, so the render order, the keyboard priority chain, and the command-bar suppression flag cannot drift apart again.

## Approach

Nine mutually-exclusive overlays float above the command bar, and the question "which one is open" is answered independently in four places. `PickerOverlays` resolves them as an ordered `if (open) return <X/>` chain: route, syntax theme, app theme, quick open, tab nav, history, queue, task, profile. `dispatchModalKey` in `useWindowKeys.ts` is the same chain in the same file order **minus quick open**. `blockingOverlayOpen` in `AppMain.tsx` is a third list of seven, omitting the queue and quick open. `PickerOverlayProps` is a fourth, two-entry subset for `MountedViewLayers`.

They have already stopped agreeing, and the consequences are visible in the code: `useWindowKeys` carries an ad-hoc `!snap.quickOpenOpen` guard on the scroll-key line, which is the patch for quick open's absence from the priority chain showing up in exactly one place.

Take the smallest increment that removes the divergence rather than the whole restructuring. Add a pure module beside the pickers holding one ordered array of overlay descriptors and the two questions asked of it — `firstOpenOverlay(state)` for the render and the key chain, `commandBarSuppressed(state)` for the suppression flag — and have all three consumers read it instead of restating the order.

**Two behaviour differences fall out, and they are not the same kind.**

Quick open joining the keyboard priority chain is the fix the divergence was hiding: while it is open, a keystroke that reaches the window should be claimed by it rather than falling through to a chord or a tab shortcut. Its own input already calls `stopPropagation`, so keys typed into it never reach the window handler at all and nothing about its own behaviour changes; what changes is that a key arriving when focus is elsewhere no longer triggers something underneath. The `!snap.quickOpenOpen` guard on the scroll line becomes redundant and goes.

The queue's absence from the suppression flag is **not** an oversight, and adding it would be a regression. `pickerOpen` makes `CommandInput.onKeyDown` return immediately, and the queue popup is the one overlay whose selected command is edited *in the command bar* — `onEditQueued` fires from the bar's own `onChange`, and `handleQueueOpenKey` reserves only Enter, the arrows, and Backspace/Delete on an empty line. Suppressing the bar for it would make the popup read-only. So the registry records that difference as data on the descriptor — `claimsCommandBar`, false for the queue alone, with the reason — rather than leaving three lists to disagree about it silently. One list still answers for all three consumers; the one genuine exception is stated once instead of being an unexplained omission.

`PickerOverlayProps` is left alone: it is a props type for two overlays that `MountedViewLayers` renders, not a fourth answer to the ordering question, and folding it in belongs with the later increments.

## Implementation steps

1. Add `web/src/pickers/overlay-registry.ts`: an `OverlayName` union, an `OverlayOpenState` record keyed by it, the ordered `OVERLAYS` descriptor array (priority is position), `firstOpenOverlay(state)`, and `commandBarSuppressed(state)`.
2. In `web/src/pickers/PickerOverlays.tsx`, build the open state from the props and switch on `firstOpenOverlay`, keeping every rendered element exactly as it is.
3. In `web/src/useWindowKeys.ts`, build the open state from the snapshot and switch on `firstOpenOverlay`, adding the quick-open case (which claims the key without a handler of its own, since its input owns its keys) and dropping the now-redundant `!snap.quickOpenOpen` scroll guard.
4. In `web/src/AppMain.tsx`, replace the seven-term expression with `commandBarSuppressed`.

## Tests

`web/src/pickers/overlay-registry.test.ts` is new and is what pins the ordering before any later increment starts, since `PickerOverlays.tsx` has no colocated test today:

- `firstOpenOverlay` returns the highest-priority open overlay when several are open, and `undefined` when none is.
- The order matches the documented priority, asserted against the array itself so a reordering is a test change.
- `commandBarSuppressed` is true for every overlay except the queue, and false when nothing is open.

`web/src/keyboard-handlers.test.ts` and the per-picker tests in `web/src/pickers/` cover the existing priority behaviour and must keep passing. Added:

- A keystroke arriving while quick open is up is claimed, so neither the scroll handler nor a tab shortcut fires under it — and one that arrives with it closed still gets through. The first of these fails against the previous implementation.

The queue popup's command-bar editing is already pinned by `CommandInput.test.tsx`'s "typing patches the selected row via onEditQueued", which is the case that rules out adding the queue to the suppression flag; it needs no new test, only to keep passing.

## Spec updates

`product/specs/keyboard-navigation.md` — state the one priority order the overlays resolve in, and that an overlay claims every keystroke while it is open. Note the queue as the single exception whose selected command is still edited in the command bar.

## Docs

None. `documentation/user-documentation/command-bar/quick-open.md` describes Quick Open's own key handling, which is unchanged; `getting-started/keyboard.md` notes only that `Ctrl+W` does nothing while a picker is open, which stays true. No page states the priority order or what happens to keys underneath an overlay, so nothing there is now wrong. `help.md` lists the shortcuts that open the overlays, not their precedence.

## Out of scope

- Folding each overlay's render and key handler into its descriptor, and collapsing the per-picker hooks behind one — the following increments.
- The roughly seventy props `App` threads through `AppMain` to `PickerOverlays`, which this leaves untouched.
- `PickerOverlayProps` and `MountedViewLayers`.
