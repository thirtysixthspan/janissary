# Share one transient-confirmation hook across the editor, image, and video tabs

**Complexity: 4/10** — ~40 added lines, 3 edited production files, 4 requirements (p=4.80).

The editor, image, and video tabs each show a confirmation for a few seconds and then clear it, each with its own state, timeout, and cleanup. `useImageEdit` and `useVideoShot` track the timer in a ref, clear the previous one, and clear on unmount; `useEditorFile` fires an untracked `setTimeout` that is never cleared, so it can call a setter after unmount and can end a newer flash early when two saves land within 1.5 seconds.

## Goal

One hook, `useTransientValue<T>(durationMs)`, in `web/src/shared/`, returning `[value, show, clear]`. Each `show` replaces any pending timer, and unmount clears it. All three tabs use it, and the editor's flash restarts on every save and never fires after unmount.

## Approach

- Add `web/src/shared/useTransientValue.ts` holding a `useState<T | null>` and a timer ref; `show(value)` sets the value and restarts the timer, `clear()` cancels the timer and resets the value, and an unmount effect cancels the timer.
- `useImageEdit` and `useVideoShot`: replace the `saved` state, `timer` ref, unmount effect, and the clear/set pair with the hook (`CONFIRMATION_MS` stays).
- `useEditorFile`: replace `savedFlash` state and the 1500 ms `setTimeout` with the hook; expose `savedFlash` as `value !== null` so `EditorMetaRow` is unchanged.

## Tests

- New `web/src/shared/useTransientValue.test.ts` with fake timers: value shows then clears after the duration; a second `show` restarts the timer and replaces the value; `clear` resets immediately; unmount cancels the timer.
- Editor: a second save within the window keeps the flash for a full duration from the second save.
- Existing editor, image, and video tests keep passing.

## Spec

`product/specs/editor-tab.md` save section: state that the "Saved" flash restarts on each save.

## Out of scope

Unifying the durations (1500 ms editor, 4000 ms image/video) and any other transient state in the app.
