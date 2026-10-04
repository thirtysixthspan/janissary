# Restore focus and key handling in the shell history popup

**Complexity: 3/10** — drop a mount-time `focus()`, add four keys to a listener that already exists, and hand the keyboard back when it closes.

**Goal.** `ShellHistoryPopup` focuses itself on mount and nothing hands focus back, so after Escape or after picking a line the focused element is removed from the document and the keyboard lands on the body: a recalled line that cannot be edited or run. The list it opens can also only be dismissed with the mouse or Escape, because it handles no other key.

**Approach.** `web/src/pickers/HistoryPicker.tsx` is the model, and the mechanism behind it is `App.tsx`'s window key handler owning Up, Down, Return and Escape while the bar stays focused. The popup is not rendered by `App`, so it needs that handler of its own — on the window, where the keystroke lands regardless of which element holds focus.

Dropping the mount-time `focus()` is what makes the bar keep the keyboard, and it is the same reason the application's picker never takes it. The `ref` and `tabIndex` go with it: the element is no longer focused by anyone, so the focusability it declared had no purpose.

Two things follow from the popup becoming modal over the bar. `ShellTab`'s `onBarKeyDown` returns early while it is open, which is precisely what `CommandInput`'s `if (pickerOpen) return;` does for the agent tab's history picker — otherwise one ArrowUp both moved the popup's selection and rewrote the bar, since the bar's own recall walks the very same lines the popup lists. And `onClose` and `onPick` refocus the bar, so a close by any route returns the keyboard to where it came from rather than relying on it never having left.

The selection starts at 0 because the popup lists newest first, so the row under the highlight is the last thing sent — the same row the application's picker opens on.

## Implementation

1. In `web/src/plugins/shell/ShellHistoryPopup.tsx`: remove the mount-time `focus()` and the `ref`/`tabIndex` that served it; track a selected index; handle Up, Down, Return and Escape on a window listener; mark the selected row with the same `selected` class the application pickers use.
2. In `web/src/plugins/shell/shell.css`, style `.shell-history-row.selected` to match `.picker-row.selected`, so the class name means the same thing in both places without inheriting the whole picker row.
3. In `web/src/plugins/shell/ShellTab.tsx`: return early from `onBarKeyDown` while the popup is open, and refocus the bar from `onClose` and `onPick`.

## Tests

In `web/src/plugins/shell/ShellTab.test.tsx`, four cases: the bar still holds focus with the popup open, `Up` then `Return` puts the second-newest line in the bar, `Escape` closes and refocuses the bar, and picking a row does the same. The first fails against the mount-time `focus()`; the second fails because `Return` reached the bar and submitted nothing; the last two pass for the right reason only once the popup closes by keyboard rather than by mouse.

## Out of scope

- Reusing the application's history picker. That one lists application commands from every tab; this tab's history is the lines this one shell was sent, which is the whole of its history because nothing can be typed into the terminal directly.
- Wrapping the popup in `ContributedOverlay` or the modal dialog shell. It is a list beside the bar, not an overlay over the application, and giving it the application's modality would be a larger change than the defect.
- Searching or filtering the list, which the application's picker has and this one never claimed.