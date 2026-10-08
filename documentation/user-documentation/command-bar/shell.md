# Shell commands

## Open a zsh shell tab

Type `zsh` to open a separate tab with a live zsh terminal. Application commands run in the command bar; unclaimed input runs directly in zsh.

Every launch opens one of these for you: the `janus` tab you start in is a zsh shell tab in the project directory. Type `zsh` in its command bar when you want another shell tab. Typing `exit` in it closes it like any shell tab, and as the last tab that quits the app.

The command bar starts focused. Double-click the terminal or press `Shift+Tab` to type directly into zsh; double-clicking clears any terminal selection made by the gesture. A single click on the terminal returns focus to the command bar. Press `Shift+Tab` again to return to the command bar. When you use the bar, each line goes to Janissary first. A recognized application command runs there and never reaches zsh; text replies such as `help` appear below the command as rendered markdown, with bold headings, colored code, bulleted lists, and lined-up tables. Long replies take the space they need in the terminal scrollback, without an internal scrollbar. As you scroll through a reply, the visible portion stays rendered even after its first row moves above the viewport. If a full-screen program is using the terminal or the reply cannot be measured or placed, it appears as styled terminal text instead. An unclaimed line goes to zsh. Prefix a line with `!` to send it straight to zsh, even when it matches an application command. While zsh is running a command, the command line reads `queue >` and anything you submit waits in the tab's command queue; the queued lines run one at a time as zsh returns to its prompt, and `Ctrl+E` shows them.

A multi-line command stays editable in the bar until you submit it. If it goes to zsh, its lines are pasted together and submitted as one command.

By default, `zsh` gives the new shell a sandbox of its own: a fresh workspace clone of the project, a separate checkout, with zsh confined to it. The full form is:

```
zsh [name] [-w|--workspace|--no-workspace] [--offline] [on <address>]
```

- `zsh docs` names the tab, and its clone folder, `docs`. A name already in use is refused in the notifications feed, as for `zsh`.
- `--no-workspace` opens an unsandboxed shell instead. It starts in the current tab's directory when that tab is unsandboxed and inside the project, and at the project root otherwise.
- `--offline` creates the clone with network access denied.
- `zsh … on <address>` opens the shell on that host in its own remote workspace. It implies a workspace even with `--no-workspace`.
- Unknown options such as `--sandbox` are refused, and nothing opens.

A sandboxed shell's tab opens right away with a spinning **Provisioning workspace** flag while the clone is made. Anything you type in its command bar meanwhile waits in the queue (`queue >`) and runs once zsh starts at the clone's root. The notifications feed then shows `Shell "<name>" ready. ($workspace/<name>)`. If the clone fails, the feed says so and the tab closes itself. Closing the tab first cancels the clone. In a project with no git repository, or no `origin` remote, `zsh` opens an unsandboxed shell and tells you why.

A remote harness or shell tab can open a sibling shell in its existing remote workspace and channel by typing `zsh` without `on`. The sibling keeps a supplied name, inherits offline mode, and starts in the source tab's working directory when that directory is inside the workspace, otherwise at the workspace root. While the workspace provisions, it answers `The remote workspace is not ready yet.`; while reconnecting or after the session is gone, it answers `The remote workspace is no longer available.` The plus button on a remote shell opens the same kind of sibling. `zsh … on <address>` from a remote tab remains unavailable and answers `Cannot launch a remote shell from a remote tab.` A local remote-shell tab appears while SSH connects, so you can answer prompts in its terminal. When the remote workspace is ready, it switches to zsh at the workspace root and reports `Shell "<name>" ready on <host>. ($workspace/<name>)` — the same form a local one uses, since the host's raw clone path would mean nothing here. Lines submitted while the tab provisions wait and run at zsh's first prompt. A remote launch failure is reported as `Failed to start "<name>" on <host>: <reason>` and the tab closes; there is no local fallback. Each `zsh` command opens a new shell tab, and its interactive zsh reads its startup files. The terminal appears after startup with a plain `> ` prompt. A shell keeps its workspace alive even if you close the tab it was opened from; the clone is removed when its last tab closes.

The terminal is painted in the application theme's own colors — background, text, cursor, and selection — so a light theme gives a light terminal. Choosing a theme in the `theme` picker updates the shell terminal too.

The shell tab's metadata row follows zsh's current working directory as you change it, shortening paths
inside the project to `$root` and paths inside the workspace clone to `$workspace/<name>`. Its file-navigator button opens the navigator in that same directory.

When a command finishes while the zsh tab is hidden, it gets an unread flag. If the flag remains unread and hidden for 30 seconds, Janissary raises the same `Agent '<tab>' is waiting` notification used for harness tabs. Starting another command clears the flag and its pending notification.

`↑` and `↓` recall lines sent from this tab's command bar, including application commands handled there, and commands typed directly into the terminal. `Ctrl+R`, or typing `hist` in the command bar, opens this tab's history; use `↑` and `↓` to choose a line, `Return` to put it back in the bar, and `Escape` to close the history.

Janissary never types anything at zsh's prompt to set the tab up. zsh's own startup does it. So zsh's history holds only what you ran: `history`, `↑` in the terminal, and your history file. It's the same for this tab's history.

`Shift+↑`/`Shift+↓` and `Ctrl+↑`/`Ctrl+↓` scroll the terminal with acceleration. `Page Up` and `Page Down` move by half a screen, and `Escape` returns to the bottom of the scrollback.

Press `Cmd+T`, or the new-shell button in the metadata row, to open another zsh tab in the directory this shell is currently in. Beside an unsandboxed shell the new one is unsandboxed too; beside a sandboxed one it shares the same workspace clone rather than making a new one. While the shell's own clone is still being made, the button is dimmed and `Cmd+T` does nothing. In other tabs, `Cmd+T` opens a new shell tab.

With the command bar focused, `Ctrl+C` sends an interrupt to zsh, unless text is selected in the bar, when it copies that text. `Ctrl+D` sends end-of-input, and `Ctrl+Z` suspends the running command. See [Keyboard shortcuts](/user-documentation/getting-started/keyboard) for these keys and the other shell-tab shortcuts.

With the terminal focused, press `Ctrl+Shift+C` to copy its selection. On macOS, press `Cmd+C`. The copied text is available from your system clipboard and the clipboard-history popup.

## Query ACP from a shell

Use `acp <prompt>` in the shell command bar to query OpenCode. Replies stream as Markdown in the ACP panel above the bar, with tool steps and a responding status. **Reset ACP** stops the current connection immediately, including while a reply is in progress. The panel and its controls belong to that shell when it is docked too. See [ACP agents](/user-documentation/advanced-agents/acp-agent) for setup, tools, and remote connections.

## Inline monitors

`monitor <persona>` watches this tab. Its suggestions and `monitor ask` replies appear in the shell’s visible output and remain in the shared activity log. Reporting monitors with explicit targets keep their own reporting tab.
