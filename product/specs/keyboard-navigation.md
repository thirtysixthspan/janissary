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
| Cmd+P | Open the Quick Open file finder (no-op, but still suppresses the browser Print dialog, on a tab that can't show it) |
| Cmd+T | Open a new agent tab rooted at the project directory (same as typing `agent`) — never workspaced |
| Ctrl+T | Expand / collapse the current tab's agent tool-step runs |
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

A focused file tree tab captures arrow keys, Home/End, PageUp/PageDown, Enter, Space, and printable
characters (type-ahead) for its own tree navigation instead of the bindings above — see File Tree Tab.
Shift+Tab is intercepted ahead of that file-tree capture and ahead of a focused harness terminal, so
section navigation still escapes them.
