# Keyboard shortcuts

All bindings work from the command bar in any agent tab.

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
| `Cmd+W` / `Ctrl+W` | Close the current tab (works inside an embedded web page too; ignored while a picker or dialog is open) |
| `Shift+↑` / `Ctrl+↑` | Scroll the transcript up — accelerates the longer you hold it |
| `Shift+↓` / `Ctrl+↓` | Scroll the transcript down — accelerates the longer you hold it |
| `Ctrl+P` | Scroll the transcript up one line per press |
| `Ctrl+N` | Scroll the transcript down one line per press |
| `Ctrl+R` | Open the [command history picker](/user-documentation/command-bar/history) |
| `Ctrl+G` | Open the [tab navigator](/user-documentation/command-bar/tab-navigator) — closes it if already open |
| `Ctrl+T` | Expand or collapse the current tab's agent tool steps |
| `Cmd+P` | Open the [quick open](/user-documentation/command-bar/quick-open) file finder |
| `PageUp` | Scroll the transcript up half a screen |
| `PageDown` | Scroll the transcript down half a screen |
| `Escape` | Reset the transcript scroll to the bottom |
| `Backspace` / `Delete` | Delete the character before the cursor |
| `Tab` | Complete the token at the cursor — see [Tab completion](/user-documentation/command-bar/tab-completion) |
| `Shift+Tab` | Move keyboard focus to the next application section — left sidebar, center, right sidebar, reporting panel — looping, skipping any that aren't currently present |

Two tab types take keyboard input for themselves. A focused [file navigator](/user-documentation/tab-types/file-navigator) captures arrow keys, `Home`/`End`, `PageUp`/`PageDown`, `Enter`, `Space`, and typed characters for tree navigation. A [harness tab](/user-documentation/advanced-agents/harness) sends everything to the harness except `Shift+←`/`Shift+→`/`Cmd+Shift+[`/`Cmd+Shift+]`/`Shift+Tab`, which still switch tabs or move focus between sections.

<img class="agent-float" src="/agents/mahir-south-east.png" alt="" />
<img class="agent-float left" src="/agents/orhan-south-west.png" alt="" />
