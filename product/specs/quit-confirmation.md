# Quit Confirmation

Guards against accidentally exiting the application from the `quit` command.

### Trigger

Typing `quit` or `/quit` at a command bar does not immediately exit. It opens a confirmation dialog reading "Are you sure you want to quit?" with two buttons, **Quit (y)** and **Cancel (n)**. The application only exits once the dialog is confirmed. When any tab has unsaved work, the walk described under "Unsaved changes" runs in place of this dialog.

This is the rule for every command bar, whichever kind of tab it belongs to: typing `quit` in a shell tab, a harness tab, or any other plugin tab's bar asks the same question, and none of them exits without it.

Typing `close` or its alias `exit` when only a single tab is open triggers the same dialog, because closing the last tab quits the app (see `tabs.md`). A single leading slash is also accepted, so `/close` and `/exit` receive the same confirmation. A named close such as `/close <name>` receives the same save or quit guard as `close <name>`. Cancelling leaves the tab open. Every other way of closing the last tab shows the same dialog too — the tab strip's × button, Cmd+W/Ctrl+W, and a page-view tab's own × button all behave identically. Only the tab's underlying process exiting on its own (not a user-initiated close) quits directly without the dialog.

A tab marked as the managed system shell is excluded from last-tab quit counting, even when it is the only remaining visible record. A user close of that tab hides it instead; the close does not open this dialog or an unsaved-changes dialog, and it does not exit the app. Closing the last ordinary user tab still opens the appropriate confirmation even if a revealed system tab remains.

### `exit` is not `quit`

`exit` is an alias of `close` (closes the current tab, or `exit <name>` for a named one) — while more than one tab is open it does not exit the application and does not show this dialog. Only `quit`, or closing the last remaining tab, exits the app.

### Selection and confirming/cancelling

**Cancel** is selected by default (visually highlighted) — quitting is the one-way, destructive option, so an unmodified `Enter` is safe. `←`/`→` move the selection between the two buttons; `Enter` runs whichever is currently selected.

- **Confirm:** pressing `y` (regardless of the current selection), pressing `Enter` while **Quit** is selected, or clicking **Quit (y)**. The dialog closes and the application performs its normal exit sequence (tears down every tab's shell/ACP/browser/terminal connections, closes the server, closes the app window).
- **Cancel:** pressing `n` (regardless of selection) or `Escape`, pressing `Enter` while **Cancel** is selected (the default), or clicking **Cancel (n)**. The dialog closes, nothing else happens, and focus returns to the command line. Clicking outside the dialog (e.g. the backdrop) does *not* cancel it — see Modal behavior below.

### Unsaved changes

When a user-triggered quit finds at least one tab with unsaved work, the first such tab's save-changes dialog opens at once; there is no summary step. The walk starts for `quit` or `/quit` typed at any command bar, and for closing the last remaining tab with `close` or `exit` (bare, slashed, or named), the tab strip's ×, Cmd+W / Ctrl+W, or a page-view tab's ×. A tab's process exiting on its own still quits directly, closing the managed system shell still hides it without asking, and a `quit` sent by a schedule or another tab still exits without asking.

The app asks about tabs in tab-strip order, left to right, regardless of which tab is current. Tabs in the other half of a split center or docked in a sidebar are asked about in that same order. A docked tab is shown in its sidebar without switching the center pane. A hidden tab is not brought on screen, and its name appears in the dialog title. The title is `Do you want to save changes to <name>?`, where `<name>` is the name shown in the tab strip: an editor's file name, otherwise the tab's title, otherwise its label. If the tab disappears while its dialog is open, the title uses its label.

Selecting another entry in a sidebar does not remove an open docked tab's unsaved work from the quit walk. When the walk reaches a dirty docked tab, it selects that tab in its sidebar before opening the save dialog.

Each prompt uses the same three buttons as the single-tab close dialog: **Save (y)**, **Don't Save (n)**, and **Cancel (Esc)**. **Save** is selected when the walk starts. `←` / `→` move the selection and `Enter` runs the selected button; `y` and `n` act regardless of the selection and do not move it. Each later prompt keeps the selection used for the previous answer, so pressing `n` while **Save** is selected leaves **Save** selected on the next tab. No new key binding is added.

**Save** writes that tab's work: the editor's file or the image tab's original image file. The walk moves on only after the write succeeds. While a save is running, **Save** is disabled; repeated `y`, `Enter` on **Save**, and clicks on it do nothing. **Don't Save** and **Cancel** remain available. If either is chosen, a write already started may still finish, but it no longer advances the walk, stops the quit, or moves focus.

**Don't Save** moves on without saving, closing, or discarding the tab; its edits remain until the app exits. **Cancel** stops the whole quit and leaves the app open, with focus in the tab that was being asked about. Files saved earlier stay saved, and tabs answered with **Don't Save** keep their edits and remain unsaved. A failed save also stops the quit, dismisses the dialog, and focuses that tab so its error or overwrite prompt is visible. Earlier answers keep their effects. If the tab is gone when any button is pressed, including **Cancel**, it is skipped and the walk moves to the next tab with unsaved work, or quits if none remain. A tab gone before its turn is skipped too.

After every tab with unsaved work has been answered with a successful **Save** or **Don't Save**, the app runs its normal exit sequence without another "Are you sure you want to quit?" prompt. Quitting again after a cancelled or failed walk starts over with every tab that still has unsaved work, including tabs previously answered with **Don't Save**. There is no progress line, **Save All**, or **Don't Save All**. Closing or reloading the browser page still shows only the browser's own "leave site?" prompt; no in-app dialog can intercept it.

"Unsaved changes" here means any tab that has registered unsaved work with the application: an editor tab holding an unwritten buffer, or an image tab holding edits that have not been saved to its original file (see [[image-tab]]). Both kinds of tab are asked about in the walk.

When no tab has unsaved changes, `quit` and last-tab-close behave exactly as described above.

Closing one tab while others remain still shows its unchanged per-tab prompt, "Do you want to save changes to this file?", and closes that tab after the answer (see `editor-tab.md`). The quit walk uses the same dialog with a different title and never closes a tab.

### Modal behavior

While the dialog is open it traps input — nothing but y/n/Enter/Escape/←/→ or a click on the dialog itself has any effect. Both input modalities are trapped the same way: a window-level *capture*-phase listener intercepts the event before it can reach anything else (the command line, a tab-strip click, keyboard shortcuts, a focused harness terminal, etc.), ahead of any other handler and the browser's own default action. This doesn't depend on z-index/paint order or on focus having actually landed on the dialog, so there's no gap for an event to slip through underneath.

The same trapping continues through every prompt in a quit walk, with no gap between one tab's answer and the next tab's dialog. Cmd+W and Ctrl+W do nothing for the whole walk, including while a save is running.

- **Mouse:** a click is checked against the dialog's bounds; a click on the dialog itself (its buttons) behaves normally, anything else — including the backdrop — is swallowed outright (blocked from reaching whatever is underneath) without cancelling the dialog. Only the **Cancel** button (or `n`/`Escape`) closes it.
- **Keyboard:** only y/n/Enter/Escape/←/→ do anything; every other key is swallowed outright.
