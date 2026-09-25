# Keyboard shortcuts

Use these shortcuts to run commands, move between tabs, scroll transcripts, and move focus through the Janissary layout.

<img class="agent-float" src="/agents/cavus-south-west.png" alt="" />

The command bar accepts the shortcuts below while an agent tab is active. `Ctrl+W` also closes the current tab from an embedded web page. It does nothing while any modal overlay is on screen, while the quit dialog is up, or while any other modal dialog is open, such as a save-changes prompt, a launch or schedule dialog, a file-navigator conflict dialog, or a confirmation. The dialog keeps the chord, and no tab behind it closes.

| Key | Action |
|---|---|
| `Return` | Execute the input line |
| `Ctrl+C` | Quit the application |
| `←` / `Ctrl+B` | Move the input cursor left |
| `→` / `Ctrl+F` | Move the input cursor right |
| `Shift+←` / `Cmd+Shift+[` | Switch to the previous tab |
| `Shift+→` / `Cmd+Shift+]` | Switch to the next tab |
| `Ctrl+←` | Move the current tab one position left |
| `Ctrl+→` | Move the current tab one position right |
| `↑` | Walk backward through command history |
| `↓` | Walk forward through command history |
| `Shift+↑` / `Ctrl+↑` | Scroll the transcript up with acceleration |
| `Shift+↓` / `Ctrl+↓` | Scroll the transcript down with acceleration |
| `Ctrl+P` | Scroll the transcript up one line |
| `Ctrl+N` | Scroll the transcript down one line |
| `PageUp` | Scroll the transcript up by half a terminal height |
| `PageDown` | Scroll the transcript down by half a terminal height |
| `Escape` | Reset the transcript scroll to the bottom |
| `Ctrl+R` | Open the command history picker |
| `Ctrl+A` | Open the task picker |
| `Ctrl+G` | Open the fuzzy tab navigator, or close it if it is open |
| `Ctrl+E` | Open the queue picker |
| `Ctrl+T` | Expand or collapse the current tab's agent tool steps |
| `Cmd+F` | Search the current tab's transcript |
| `Cmd+P` | Open the Quick Open file finder |
| `Cmd+T` | Open a new agent tab |
| `Cmd+I` / `Ctrl+I` | Start a chat with the current text selection |
| `Tab` | Complete a file path, agent name, connection, browser subcommand, or window ID |
| `Backspace` / `Delete` | Delete the character before the cursor |

## Move focus between application sections

The window can contain four application sections: a left sidebar, the center action area, a right sidebar, and the reporting section. The center is always present. A sidebar appears only when it contains a docked tab, and reporting appears only when it contains a monitor.

<img class="agent-float left" src="/agents/demir-south.png" alt="" />

Press `Shift+Tab` to move focus to the next section in this order: left sidebar, center, right sidebar, reporting. The shortcut skips sections that are not present and wraps from the last present section to the first. The section's currently visible tab receives focus. If the center is already the only section, focus stays in the center.

Focus follows the section under the pointer too. Pressing `Shift+Tab` after clicking a docked tab therefore starts from that sidebar rather than from the center.

![The Janissary window layout showing the central tab area and surrounding application sections.](/screenshots/app-overview.png)

The focused section changes without sending a command to the application.

<img class="agent-float" src="/agents/hamza-south-east.png" alt="" />

`Shift+Tab` works while a file navigator or harness tab has focus. It is handled before those views receive the key, so you can always leave them. A file navigator still captures its own arrow keys, `Home`, `End`, `PageUp`, `PageDown`, `Enter`, `Space`, and printable characters for tree navigation. A harness receives its other keystrokes, including `Ctrl+C`.

Bare `Tab` keeps its command-completion behavior in the command bar.

## While an overlay is open

The nine overlays that float above the command bar are mutually exclusive: only one is ever on screen. When more than one could be open, a fixed order decides which wins and which one your keystrokes go to:

1. route chooser
2. syntax-theme picker
3. application-theme picker
4. Quick Open
5. tab navigator
6. command history picker
7. command queue popup
8. task picker
9. profile picker

An open overlay claims every keystroke. Nothing underneath it scrolls the transcript, switches tabs, or reorders them, and the shortcut that would open another overlay does nothing until the open one is dismissed. Quick Open holds its own text input and answers its own typing, arrows, `Enter`, and `Escape` there. The command queue popup is the one exception: its selected command is edited in the command bar, so the bar keeps working while it is open, with only `Enter`, the arrows, and `Backspace`/`Delete` on an empty line reserved by the popup.

## Keys inside a dialog

`Cmd+W`/`Ctrl+W` and `Shift+Tab` do nothing while a modal dialog is open. The dialog keeps both, so no tab behind it closes and focus stays inside the dialog.

A two-button confirmation takes `y` and `n` as direct shortcuts, `←` and `→` to move the selection, `Enter` to run the selected option, and `Escape` to cancel. Cancel is selected when the dialog opens. Every other key is swallowed rather than reaching whatever is under the dialog, and a click outside it is swallowed the same way.
