# Keyboard Navigation

| Key | Action |
|---|---|
| Return | Execute input |
| Ctrl+C | Quit application |
| ← / Ctrl+B | Move input cursor left |
| → / Ctrl+F | Move input cursor right |
| Shift+← / Cmd+Shift+[ | Switch to previous tab (no-op if one tab) |
| Shift+→ / Cmd+Shift+] | Switch to next tab (no-op if one tab) |
| Ctrl+← | Move the current tab one position left |
| Ctrl+→ | Move the current tab one position right |
| ↑ | Walk backward through command history |
| ↓ | Walk forward through command history |
| Cmd+W / Ctrl+W | Close the current tab (also works when focus is inside an embedded web page; no-op when a picker, route chooser, or quit dialog is open) |
| Shift+↑ / Ctrl+↑ | Scroll transcript up (accelerated — distance doubles each second held) |
| Shift+↓ / Ctrl+↓ | Scroll transcript down (accelerated — distance doubles each second held) |
| Ctrl+P | Scroll transcript up (fixed — one line per press) |
| Ctrl+N | Scroll transcript down (fixed — one line per press) |
| Ctrl+R | Open command history picker |
| Ctrl+A | Open the task picker |
| Ctrl+G | Open the fuzzy tab navigator (also closes it if already open) |
| Ctrl+E | Open the agent command queue popup (no-op if the exposed tab is not an agent tab) |
| Cmd+P | Open the Quick Open file finder from any focused tab |
| Cmd+T | Open a new workspaced agent tab (same as typing `agent`) |
| Ctrl+T | Expand / collapse the current tab's agent tool-step runs |
| Ctrl+O | Move the running shell command into a full-tab terminal (no-op when nothing is running) |
| PageUp | Scroll transcript up by half terminal height |
| PageDown | Scroll transcript down by half terminal height |
| Escape | Reset scroll to bottom |
| Backspace / Delete | Delete character before cursor |
| (printable) | Insert character at cursor |
| Tab | Complete the token at the cursor: a file path, a `msg`/`broadcast` agent name, a `connection close` connection string, or a `browser` subcommand / window id |
| Shift+Tab | Move keyboard focus to the next application section (left sidebar → center → right sidebar → reporting, wrapping back to left, skipping any section that is not currently present). The section's currently-visible tab receives focus. |

The UI is composed of up to four **application sections**: the left sidebar, the center action
area, the right sidebar, and the reporting section below it. A section exists only when it holds
at least one tab (the center is always present). Moving keyboard focus into a section always
focuses that section's currently-visible tab — the docked tab shown in a sidebar, or the selected
monitor in the reporting section.

A focused file navigator tab captures arrow keys, Home/End, PageUp/PageDown, Enter, Space, and printable
characters (type-ahead) for its own tree navigation instead of the bindings above — see File Navigator Tab.
Shift+Tab is intercepted ahead of that file-navigator capture and ahead of a focused harness terminal, so
section navigation still escapes them.

### Overlay priority

The modal overlays that float above the command bar are mutually exclusive: only one is ever on
screen. When more than one could be open, one order decides which wins, and the same order decides
which one keystrokes go to:

1. route chooser
2. syntax-theme picker
3. application-theme picker
4. Quick Open
5. tab navigator
6. command history picker
7. command queue popup
8. task picker
9. profile picker

While an overlay is open it claims every keystroke: nothing underneath it scrolls the transcript,
switches tabs, or reorders them, and the shortcuts that open the other overlays do nothing until it
is dismissed. Quick Open holds its own text input and handles its own typing, arrows, Enter, and
Escape there.

The command queue popup is the one exception to an overlay taking the command bar's keys. Its
selected command is edited **in** the command bar — typing there rewrites the queued entry — so the
bar keeps working while it is open, with only Enter, the arrows, and Backspace/Delete on an empty
line reserved by the popup itself.
