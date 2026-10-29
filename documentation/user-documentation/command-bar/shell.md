# Shell commands

## Open a shell tab

Type `shell` to open a separate tab with a live zsh terminal. Application commands run in the command bar; unclaimed input runs directly in zsh. To run a shell command from another tab's command bar, prefix it with `!`. Spaces after the `!` are dropped, so `! git status` works like `!git status`. A bare `!` runs an empty command and prints nothing.

Without the `!`, a line that isn't an application command never reaches the captured shell. If nothing else in the tab claims it, the reply is `Unknown command: "<text>". Type "help" for available commands.`, with the text in lowercase.

When you run a shell command this way, Janissary captures at most 1 Mi characters for the reply. If the command produces more, the captured output ends with `(output truncated after 1 MiB)`, but the command keeps running until it finishes. This limit applies to the captured reply, not to the interactive zsh terminal's own scrollback.

Captured commands run in a separate shell process for each tab. It is the program named by your `SHELL` environment variable, or `bash` when that isn't set. Bash and zsh start without reading their startup files (`.bashrc`, `.zshrc` and the like), so aliases, functions, and prompt settings from them aren't available. Type `!pwd` in a tab's command bar to run a command there; Janissary captures both standard output and error in that tab's transcript, and the output appears as the command produces it. The process keeps its working directory and environment between commands, and starts in the tab's current directory. If that directory no longer exists, it starts in the project directory instead. After each command Janissary reads the shell's working directory, so after `!cd src` the tab's current directory is `src`. Commands in the same tab run one at a time, including when you queue them.

A tab opened in a sandboxed workspace runs its captured commands inside that workspace, with the same confinement, and with network access denied if the tab is offline. A remote tab runs them on the remote machine, in its remote workspace, over the tab's existing connection.

Closing the tab or shutting down Janissary stops its captured shell. If the shell exits on its own during a command, the reply ends with `(shell exited)`; the next command starts a new shell process. `connection close shell` also stops the shell but keeps the tab open. A command still running in a local shell then ends its reply with `(shell exited)` once the command stops producing output, which a long-running program can hold off until it finishes. See [Connections](/user-documentation/command-bar/connections).

Every launch opens the visible `janus` zsh shell tab in the project directory, plus one hidden `system` shell in the project directory without a workspace. Run `tab focus system` to reveal the hidden shell; closing it hides it without stopping its process. If the `system` shell exits on its own, Janissary sends the exit to the terminal, hides that tab, and starts a fresh shell in the same tab. The new shell starts at the project root, wherever the old one had last been. Scheduled commands you added to the `system` tab itself are dropped when its shell exits. Project system schedules are not affected. Run `tab focus system` to use it again. If replacement fails, the hidden tab stays available for a later retry. If the shell cannot start at launch, Janissary continues starting and posts `System shell could not start: <reason>.` in Notifications. The required `janus` tab remains your starting point. Type `shell` in its command bar when you want another shell tab. Typing `exit` in `janus` closes it like any ordinary shell tab, and as the last visible tab that quits the app.

<img class="agent-float" src="/agents/fariz-south-east.png" alt="" />

The command bar starts focused. Double-click the terminal or press `Shift+Tab` to type directly into zsh; double-clicking clears any terminal selection made by the gesture. A single click on the terminal returns focus to the command bar. Press `Shift+Tab` again to return to the command bar. When you use the bar, each line goes to Janissary first. A recognized application command runs there and never reaches zsh; text replies such as `help` appear below the command as rendered markdown, with bold headings, colored code, bulleted lists, and lined-up tables. Long replies take the space they need in the terminal scrollback, without an internal scrollbar. As you scroll through a reply, the visible portion stays rendered even after its first row moves above the viewport. If a full-screen program is using the terminal or the reply cannot be measured or placed, it appears as styled terminal text instead. An unclaimed line goes to zsh. Prefix a line with `!` to send it straight to zsh, even when it matches an application command. While zsh is running a command, the command line reads `queue >` and anything you submit waits in the tab's command queue; the queued lines run one at a time as zsh returns to its prompt, and `Ctrl+E` shows them. With text in the focused command line, `Escape` clears the draft without running it; if completion choices are showing, the first `Escape` closes that strip and leaves the draft alone. With an empty line, `Escape` returns the terminal to the bottom of its scrollback.

When zsh exits on its own, its shell tab closes without a quit or unsaved-changes prompt. If it was the last center tab, Janissary quits immediately. A managed `system` shell instead stays hidden and is restarted in the same tab.

A multi-line command stays editable in the bar until you submit it. If it goes to zsh, its lines are pasted together and submitted as one command.

The command bar handles application commands before zsh. Bare `clear` clears the terminal; use `/clear` to clear an app transcript. If an application command takes more than 30 seconds, its reply shows the output produced so far and the command keeps running. This timeout does not close the shell or its zsh process.

By default, `shell` gives the new shell a sandbox of its own: a fresh workspace clone of the project, a separate checkout, with zsh confined to it. The full form is:

```
shell [name] [-w|--workspace|--no-workspace] [--offline] [on <address>] [in group <name|id>]
```

- `shell docs` names the tab, and its clone folder, `docs`. A name already in use is refused in the notifications feed, as for `shell`.
- `in group <name|id>` joins an existing group by name or number. Names match without regard to case. An unknown name creates a group; an unknown positive number creates that numbered group.
- `--no-workspace` opens an unsandboxed shell instead. It starts in the current tab's directory when that tab is unsandboxed and inside the project, and at the project root otherwise.
- `--offline` creates the clone with network access denied.
- `shell … on <address>` opens the shell on that host in its own remote workspace. It implies a workspace even with `--no-workspace`.
- Unknown options such as `--sandbox` are refused, and nothing opens.

A sandboxed shell's tab opens right away with a spinning **Provisioning workspace** flag while the clone is made. The new-shell button and the diff button are disabled meanwhile, and the new-shell button's tooltip reads `Waiting for the workspace`. **Open file navigator here** stays available. Anything you type in its command bar meanwhile waits in the queue (`queue >`) and runs once zsh starts at the clone's root. The notifications feed then shows `Shell "<name>" ready. ($workspace/<name>)`. If the clone fails, the feed says so and the tab closes itself. Closing the tab first cancels the clone. In a project with no git repository, or no `origin` remote, `shell` opens an unsandboxed shell and tells you why.

A remote harness or shell tab can open a sibling shell in its existing remote workspace and channel by typing `shell` without `on`. The sibling keeps a supplied name, inherits offline mode, and starts in the source tab's working directory when that directory is inside the workspace, otherwise at the workspace root. While the workspace provisions, it answers `The remote workspace is not ready yet.`; while reconnecting or after the session is gone, it answers `The remote workspace is no longer available.` The plus button on a remote shell opens the same kind of sibling. `shell … on <address>` from a remote tab remains unavailable and answers `Cannot launch a remote shell from a remote tab.` A local remote-shell tab appears while SSH connects, so you can answer prompts in its terminal. When the remote workspace is ready, it switches to zsh at the workspace root and reports `Shell "<name>" ready on <host>. ($workspace/<name>)` — the same form a local one uses, since the host's raw clone path would mean nothing here. Lines submitted while the tab provisions wait and run at zsh's first prompt. A remote launch failure is reported as `Failed to start "<name>" on <host>: <reason>` and the tab closes; there is no local fallback. If the remote zsh exits before its first prompt, the notifications feed says `Failed to start "<name>" on <host>: zsh exited before its first prompt.` Each `shell` command opens a new shell tab, and its interactive zsh reads its startup files. The terminal appears after startup with a plain `> ` prompt. A shell keeps its workspace alive even if you close the tab it was opened from; the clone is removed when its last tab closes.

The terminal is painted in the application theme's own colors — background, text, cursor, and selection — so a light theme gives a light terminal. Choosing a theme in the `theme` picker updates the shell terminal too, without a restart. The 16 ANSI colors that programs print keep the standard terminal values in every theme. [Harness and ssh tabs](/user-documentation/command-bar/commands#theme) are different: they stay dark whichever theme you pick.

The shell tab's metadata row follows zsh's current working directory as you change it, shortening paths
inside the project to `$root`, paths inside the workspace clone to `$workspace/<name>`, and paths inside the shared git-sync clone to `$git-sync`. Its file-navigator button opens the navigator in that same directory.

When a command finishes while the zsh tab is hidden, it gets an unread flag. If the flag remains unread and hidden for 30 seconds, Janissary raises the same `Agent '<tab>' is waiting` notification used for harness tabs. Starting another command clears the flag and its pending notification.

`↑` and `↓` recall lines sent from this tab's command bar, including application commands handled there, and commands typed directly into the terminal. `Ctrl+R`, or typing `hist` in the command bar, opens this tab's history; use `↑` and `↓` to choose a line, `Return` to put it back in the bar, and `Escape` to close the history. The list runs oldest to newest with the newest line selected, and an empty history reads `No commands sent yet`. A multi-line command shows as its first line with a postfix such as `(3 lines)` and comes back whole. Each entry is stored without leading or trailing whitespace, and an empty or whitespace-only line is never recorded. `hist` itself isn't added to the list.

This tab history and the global command history are different. The tab history includes commands typed directly into its terminal. Global ghost suggestions include only lines submitted through the command bar, including application commands and lines prefixed with `!`. Direct terminal input and commands delivered by `send` or `queue` don't enter global history. Setup commands installed by the shell don't appear in either history.

Janissary never types anything at zsh's prompt to set the tab up. zsh's own startup does it. So zsh's history holds only what you ran: `history`, `↑` in the terminal, and your history file. It's the same for this tab's history.

`Shift+↑`/`Shift+↓` and `Ctrl+↑`/`Ctrl+↓` scroll the terminal with acceleration. `Page Up` and `Page Down` move by half a screen, and `Escape` returns to the bottom of the scrollback.

Press `Cmd+T`, or the new-shell button in the metadata row, to open another zsh tab in the directory this shell is currently in. Beside an unsandboxed shell the new one is unsandboxed too; beside a sandboxed one it shares the same workspace clone rather than making a new one. While the shell's own clone is still being made, the button is dimmed and `Cmd+T` does nothing. In other tabs, `Cmd+T` opens a new shell tab.

`Cmd+T` belongs to the visible shell tab, or to the selected shell when it is docked. A docked shell doesn't take the shortcut from another tab's command bar. The metadata row also offers **Open file navigator here**, **new shell here**, a split control, and connection and schedule windows. A remote shell shows its host and connection state; **Detach** closes every tab sharing that remote session after confirmation, and **Attach** is available while it reconnects.

With the command bar focused, `Ctrl+C` sends an interrupt to zsh, unless text is selected in the bar, when it copies that text. `Ctrl+D` sends end-of-input, and `Ctrl+Z` suspends the running command. See [Keyboard shortcuts](/user-documentation/getting-started/keyboard) for these keys and the other shell-tab shortcuts.

Select text in the terminal or a rendered reply, then press `Ctrl+Shift+C` to copy it. On macOS, press `Cmd+C`. The copied text is available from your system clipboard and the clipboard-history popup.

To select text in a rendered reply, such as `help` output, drag over it. The selection stays highlighted when you let go and the keyboard stays in the command bar, so the copy chord works from there. Dragging past the top or bottom of the reply runs the selection to its start or end. A reply selection and a terminal selection can't both be held: a primary-button press anywhere in the terminal, a double-click, or a resize of the terminal clears whichever is held. A right-click keeps it, and its menu offers **Copy**. A click that ends a drag on a link doesn't follow the link.

A web address in a reply opens through `open`, and a `path:line` reference opens in an editor tab at that line. A click on any other link does nothing, because a reply never navigates the Janissary window.

A program running in the shell can copy too, by sending the terminal an OSC 52 request. That is how a program on a remote or SSH host reaches the clipboard of the machine you're looking at. The text goes through the same clipboard path as your own copy. A request to read the clipboard back is answered with nothing.

## Read a shell session's transcript

<img class="agent-float left" src="/agents/bilal-south.png" alt="" />

Press the 📋 **Open transcript** button in the shell tab's metadata row. It opens everything the shell has shown so far in an editor tab named after the file, such as `tx-2026-10-13T03-42-46-527Z.txt`, where `Cmd+F` searches it. `Cmd+F` does nothing in the terminal itself. The button appears as the shell starts. You can't save over the transcript while its shell is running or while its final lines are being written after the shell exits; the editor reports the save as failed and the notifications feed says `This shell transcript is still being written; copy it to another file to edit it.` To keep notes on it, copy it to another file first. You can't rename or move it during that same period, from its editor tab or a file navigator, and the notifications feed says `A running shell is still writing this transcript; rename or move it after the shell exits`. You can delete it from a file navigator. At shutdown, Janissary waits up to one second for open transcripts to write their final row and close.

The file lives at `.janissary/shell-transcripts/<name>-<timestamp>.txt` on the machine running Janissary, even when the shell itself is remote. The tab's recording, named the same way, sits in `.janissary/recordings/`. The transcript is plain text: the prompts, the commands you typed and their output, with no colors. A full-screen program such as `vim` or `less` isn't in it, though what the shell printed before and after is. Replies to app commands such as `help` aren't in it either. Each line is saved once, when the cursor moves past it, so a later `clear` doesn't erase anything already saved. When the shell closes or exits, its unfinished prompt or progress row is saved as it stands.

Be careful with secrets. A secret you type on a command line, such as `export TOKEN=…`, ends up in the file. A password typed at a prompt that hides your typing, like `sudo` or `ssh`, doesn't. The file never leaves your machine.

Transcripts are cleared at every launch. To turn them off, set `"recordShellTabs": false` in `.janissary/config.json` and restart. That turns off the shell recording too. See [app configuration](/user-documentation/getting-started/configuration) for the other settings.

The transcript file has no size cap. It stops for the rest of the session, keeping the rows already saved, in three cases: its folder can't be written, more than 4 MiB is waiting to reach disk, or output arrives faster than it can be transcribed. The unfinished row isn't saved after a failure. The notifications feed then shows `shell transcript failed`, once per open tab however many times it fails, and the shell and its recording keep running. The button still opens whatever was saved before the failure.

A single unbroken line longer than 1000 terminal rows keeps only the row it ends on.

## Play a shell recording

Each shell session is recorded automatically unless the project sets `"recordShellTabs": false` in `.janissary/config.json`. Press the film icon in the metadata row to open the recording while the shell is running or after recording stops. You can also run `play <label>` to open the newest recording for that shell, or open its `.cast` file from the file navigator. See [Recording player](/user-documentation/tab-types/recording-player) for playback controls.

The recording captures terminal output and resizes, not keystrokes as input. But zsh echoes command lines and interactive programs often echo what you type, so those characters are recorded too. A secret typed at a command prompt can appear in the recording. A password entered at a prompt that hides typing is not echoed and is not recorded. Files stay under `.janissary/recordings/` on the machine running Janissary and are cleared at a fresh launch. If writing fails, the shell keeps running, the notifications feed shows `shell recording failed`, and the film icon still opens any partial recording.

## Query ACP from a shell

Use `acp <prompt>` in the shell command bar to query OpenCode. Replies stream as Markdown in the ACP panel above the bar, with tool steps and a responding status. **Reset ACP** stops the current connection immediately, including while a reply is in progress. The panel and its controls belong to that shell when it is docked too. See [ACP agents](/user-documentation/advanced-agents/acp-agent) for setup, tools, and remote connections.

## Inline monitors

<img class="agent-float" src="/agents/hakim-south-west.png" alt="" />

`monitor <persona>` watches this tab. Its suggestions and `monitor ask` replies appear in the shell’s visible output and remain in the shared activity log. Reporting monitors with explicit targets keep their own reporting tab.
