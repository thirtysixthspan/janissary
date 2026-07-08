# Quit Confirmation

Guards against accidentally exiting the application from the `quit` command.

### Trigger

Typing `quit` at the command line does not immediately exit. It opens a confirmation dialog reading "Are you sure you want to quit?" with two buttons, **Quit (y)** and **Cancel (n)**. The application only exits once the dialog is confirmed.

Typing `close` (or its alias `exit`) when only a single tab is open triggers the same dialog, because closing the last tab quits the app (see `tabs.md`). Cancelling leaves the tab open. Non-typed last-tab closes — the tab strip's × button, or the tab's process exiting — quit directly without the dialog.

### `exit` is not `quit`

`exit` is an alias of `close` (closes the current tab, or `exit page <n>` for a numbered page tab) — while more than one tab is open it does not exit the application and does not show this dialog. Only `quit`, or closing the last remaining tab, exits the app.

### Selection and confirming/cancelling

**Cancel** is selected by default (visually highlighted) — quitting is the one-way, destructive option, so an unmodified `Enter` is safe. `←`/`→` move the selection between the two buttons; `Enter` runs whichever is currently selected.

- **Confirm:** pressing `y` (regardless of the current selection), pressing `Enter` while **Quit** is selected, or clicking **Quit (y)**. The dialog closes and the application performs its normal exit sequence (tears down every tab's shell/ACP/browser/terminal connections, closes the server, closes the app window).
- **Cancel:** pressing `n` (regardless of selection) or `Escape`, pressing `Enter` while **Cancel** is selected (the default), or clicking **Cancel (n)**. The dialog closes, nothing else happens, and focus returns to the command line. Clicking outside the dialog (e.g. the backdrop) does *not* cancel it — see Modal behavior below.

### Unsaved editor changes

If any open editor tab has unsaved changes when `quit` runs (or `close`/`exit` closes the last remaining tab), the app shows a different dialog instead of the usual quit confirmation: "You have unsaved changes. Close anyway?" with **Close anyway (y)** and **Cancel (n)**. This dialog behaves identically to the quit dialog above (same selection/confirm/cancel keys, same modal trapping) but with different button labels and no intermediate step — confirming quits immediately, discarding whatever was unsaved; there is no per-file save prompt here. Cancelling leaves every tab open and its edits intact.

When no editor tab has unsaved changes, `quit` and last-tab-close behave exactly as described above.

This is separate from — and does not replace — the per-tab unsaved-changes prompt shown when closing a single editor tab while other tabs remain open (see `editor-tab.md`).

### Modal behavior

While the dialog is open it traps input — nothing but y/n/Enter/Escape/←/→ or a click on the dialog itself has any effect. Both input modalities are trapped the same way: a window-level *capture*-phase listener intercepts the event before it can reach anything else (the command line, a tab-strip click, keyboard shortcuts, a focused harness terminal, etc.), ahead of any other handler and the browser's own default action. This doesn't depend on z-index/paint order or on focus having actually landed on the dialog, so there's no gap for an event to slip through underneath.

- **Mouse:** a click is checked against the dialog's bounds; a click on the dialog itself (its buttons) behaves normally, anything else — including the backdrop — is swallowed outright (blocked from reaching whatever is underneath) without cancelling the dialog. Only the **Cancel** button (or `n`/`Escape`) closes it.
- **Keyboard:** only y/n/Enter/Escape/←/→ do anything; every other key is swallowed outright.
