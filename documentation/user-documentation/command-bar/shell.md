# Shell commands

Type a shell command the way you'd type it in a terminal, and it runs in the tab's shell:

```
ls -la
git status
npm test
```

Output streams into the transcript line by line as it's produced, with ANSI colors and styling intact — a test suite's colored pass/fail summary looks the way it should. `file.ts:42`-style paths in the output are clickable and open the file in an [editor tab](/user-documentation/tab-types/editor) at that line.

Plain commands like these are recognized as shell input automatically. When a line could be read more than one way — a shell command, a SQL query, a prompt for the agent — the app asks instead of guessing, floating a chooser above the command bar; pick a route with `↑`/`↓` and `Return`, or `Escape` to cancel. To skip recognition entirely, prefix the line with `shell `:

```
shell find . -name "*.ts"
```

The prefix is the deterministic escape hatch — whatever follows it goes straight to the shell. `!` is shorthand for the same thing — `!find . -name "*.ts"` is identical to `shell find . -name "*.ts"` — and `!!` is shorthand for `shell --pty`, forcing the command straight into a full-tab terminal (see below): `!!htop` is identical to `shell --pty htop`.

The chooser always lists `shell` and `acp (agent prompt)`. It also lists one `db query → <name>`
option for each database connection open in the current tab. It does not offer a database route
when that tab has no open database. A confident SQL guess runs immediately when exactly one database
is open. With several open, the guess opens the chooser instead so you can pick the target; with
none open, there is no target to pick and the guess is not offered as a database route. You can also
skip recognition with the `acp ` prefix, or with `db ` followed by a whole database command —
`db sqlite query <name> <sql>`, since the word after `db` is read as the engine name.

A command word that is also an ordinary English word is read as the start of a sentence when the
line looks like one. `find the largest file in this repo` goes to the agent, while `find . -name
"*.ts"` goes to the shell.

The chooser is modal, so the command bar is disabled until you choose or cancel. It is titled
`route: <the line you typed>`. Use `↑` and `↓`, press `Return`, or click a row. `acp (agent prompt)`
is highlighted when the chooser opens.

The chooser belongs to the tab that raised it. Answering it while you have clicked over to a different tab runs the command in the original one, not the one you are looking at. Keyboard tab-switching is blocked while a chooser is open, which hides this most of the time; the mouse is the way in.

Only one chooser is open at a time, and that holds across the whole app, not just one tab. While one is open, nothing else can open one: a command in any other tab, or a scheduled or queued one, doesn't run, and its own tab shows `Another command is waiting for a route choice; run this again once it is answered.` Only the tab that raised the chooser has its command queue paused; every other tab keeps draining. Closing the tab that opened the chooser also closes the chooser.

Typed in a tab, a line that no built-in command claims and that fits no confident route always gets the chooser, never a refusal — there is always `shell` and `acp (agent prompt)` to pick. The `Unknown command: "<what you typed>". Type "help" for available commands.` line exists, but a command sent to a tab by another one is the only path that produces it, and it arrives in the sender's transcript as that tab's answer.

See [Databases](/user-documentation/command-bar/database) for database routing and [ACP agents](/user-documentation/advanced-agents/acp-agent)
for agent-prompt routing.

## One shell per tab, and it persists

<img class="agent-float" src="/agents/aslan-south-west.png" alt="" />

Each tab has its own shell process that lives as long as the tab does. State accumulates the way it would in a terminal: `cd` somewhere and later commands in that tab run there; exported variables stick around. The working directory is also remembered per tab, so a shell respawned after one dies starts where the last one left off. If the shell process dies unexpectedly, a fresh one is spawned on your next command.

A remembered directory that has since been deleted or renamed is not worth starting a shell in. Such a tab's shell starts in the project directory instead, which is where a new tab starts anyway, and the next command you run there records that directory in place of the stale one.

A shell can also end on its own in the middle of a command: `exit`, `exec`, a `set -e` script hitting a failure, `kill -9 $$`, or a crash. The command it was running finishes with whatever it had printed, followed by `(shell exited)` on its own line, the tab stops showing as busy, and anything already queued behind it runs straight away instead of waiting. The next command in that tab starts a fresh shell in the tab's working directory.

Closing a tab kills its shell; quitting the app kills them all. A shell Janissary killed that way doesn't report `(shell exited)` — its running command is simply abandoned along with it.

## Your startup files don't run

<img class="agent-float left" src="/agents/hakim-south.png" alt="" />

A tab's shell is your login shell, started with its startup files skipped. Your `.bashrc`, `.zshrc`, and `.profile` are not read, so the aliases, functions, prompt, and `PATH` edits you keep in them are not there. That's deliberate: an interactive startup file prints banners and sets traps, and all of it would land in the middle of the output the app captures.

What you do get is the environment `janus` itself was launched with. Export something in the terminal before you start the app and every tab shell sees it.

If you need one of your aliases, the ways to get it are to run it through your shell yourself, to source the file first, or to open an interactive shell in the tab:

```
zsh -ic "myalias"
source ~/.zshrc && myalias
shell --pty
```

Interactive programs are the exception to all of this. They run through an interactive shell, so anything on the tab's own terminal, including a bare `shell --pty`, reads your startup files as usual — `.zshrc` included, which a login shell alone skips. Your aliases, functions, and `PATH` edits are all there. It's deliberately not a login shell: login startup rebuilds `PATH` from the system's own list of directories rather than keeping yours as it is, which can change which copy of a command you get.

Only `bash` and `zsh` are given the flags to skip startup files. Any other login shell reads its own, since refusing to launch on a flag it doesn't recognize would be worse.

## Interactive programs take over the tab

<img class="agent-float" src="/agents/bilal-south.png" alt="" />

Full-screen and interactive programs — `htop`, `vim`, `less`, `man`, `python` and other REPLs — can't run through the ordinary transcript. When you run one, the tab switches into a full-tab terminal: the transcript and command bar disappear and the program gets the whole tab, with every keystroke — including `Ctrl+C`, `Ctrl+D`, and `Ctrl+Z` — forwarded to it. Only `Shift+←`/`Shift+→` still switch tabs, and you can keep several tabs' interactive programs running at once; each keeps its screen state while you're elsewhere.

`Shift+Enter` inserts a line continuation rather than submitting, which matters for programs (AI harnesses in particular) that accept multi-line input.

When the program exits, the transcript comes back exactly as it was — nothing about the takeover is logged.

To force a command into a full-tab PTY that isn't auto-detected, add `--pty` right after `shell`:

```
shell --pty ./some-interactive-script.sh
```

A bare `shell --pty`, with no command after it, opens your login shell directly in the tab — a plain interactive shell prompt. `!!` is shorthand for `shell --pty`, so `!!./some-interactive-script.sh` and a bare `!!` do the same thing.

## Programs that aren't on the list

The names above are a fixed list, and it can't cover everything — your own TUI, or a program under a name Janissary doesn't know, isn't on it. Those still work, because commands run with a real terminal attached: when a program takes over the screen, the tab switches into a full-tab terminal mid-command and the screen it had already drawn is carried over intact. When the command finishes you're back in the transcript, and its entry reads `(ran in terminal)`.

Janissary remembers what it caught. The next time you run that program it opens a terminal straight away, with no transcript entry and no pause — so a program costs you one detection, ever. What's remembered lives in `.janissary/interactive-commands.json`, a plain list you can edit: delete a line to forget a program, or delete the file to start fresh. `git log` is remembered as `git log`, not as `git`, so `git status` keeps behaving normally. The file sits beside your other project settings rather than in the state directory, so an ordinary restart keeps what it has learned. Break the JSON while editing it and the list simply loads as empty for that session, with your file left exactly as you wrote it — nothing warns you, so re-check the file if a program you forgot about starts opening a terminal again.

Some programs need a terminal without ever saying so — a `sudo` password prompt, a `read`, a bare REPL. Those just sit there waiting. Click **open in terminal** on the running line, or press `Ctrl+O`, and the command moves into a terminal where you can type. It ends like any other: when the command finishes, the terminal closes, the transcript comes back with its entry reading `(ran in terminal)`, and the agent is free for your next command. Doing it by hand is a one-off and isn't remembered.

A real terminal also means commands behave the way they do in one: output comes back in color, and `git log` or `git diff` open a pager instead of printing everything at once.

If you'd rather have none of this, set `interactiveShellDetection` to `false` in `.janissary/config.json`. Commands then run through plain pipes and only the built-in list of interactive programs applies — though anything already remembered still opens a terminal.

## Open a zsh shell tab

Type `zsh` to open a separate tab with a live zsh terminal. This is different from running a command with `shell` or taking over the current tab with `shell --pty`.

Every launch opens one of these for you: the `janus` tab you start in is a zsh shell tab in the project directory. Type `agent` in its command bar when you want an agent tab. Typing `exit` in it closes it like any shell tab, and as the last tab that quits the app.

The command bar starts focused. Double-click the terminal or press `Shift+Tab` to type directly into zsh; a single click on the terminal returns focus to the command bar. Press `Shift+Tab` again to return to the command bar. When you use the bar, each line goes to Janissary first. A recognized application command runs there and never reaches zsh; text replies such as `help` appear below the command as rendered markdown, with bold headings, colored code, bulleted lists, and lined-up tables. Long replies take the space they need in the terminal scrollback, without an internal scrollbar. As you scroll through a reply, the visible portion stays rendered even after its first row moves above the viewport. If a full-screen program is using the terminal or the reply cannot be measured or placed, it appears as styled terminal text instead. An unclaimed line goes to zsh. Prefix a line with `!` to send it straight to zsh, even when it matches an application command. While zsh is running a command, the command line reads `queue >` and anything you submit waits in the tab's command queue; the queued lines run one at a time as zsh returns to its prompt, and `Ctrl+E` shows them.

A multi-line command stays editable in the bar until you submit it. If it goes to zsh, its lines are pasted together and submitted as one command.

By default, `zsh` gives the new shell a sandbox of its own: a fresh workspace clone of the project, the same kind `agent` creates, with zsh confined to it. The full form is:

```
zsh [name] [-w|--workspace|--no-workspace] [--offline]
```

- `zsh docs` names the tab, and its clone folder, `docs`. A name already in use is refused in the notifications feed, as for `agent`.
- `--no-workspace` opens an unsandboxed shell instead. It starts in the current tab's directory when that tab is unsandboxed and inside the project, and at the project root otherwise.
- `--offline` creates the clone with network access denied.
- `zsh … on <address>` and unknown options such as `--sandbox` are refused, and nothing opens.

A sandboxed shell's tab opens right away with a spinning **Provisioning workspace** flag while the clone is made. Anything you type in its command bar meanwhile waits in the queue (`queue >`) and runs once zsh starts at the clone's root. The notifications feed then shows `Shell "<name>" ready. (workspace: …)`. If the clone fails, the feed says so and the tab closes itself. Closing the tab first cancels the clone. In a project with no git repository, or no `origin` remote, `zsh` opens an unsandboxed shell and tells you why.

A remote agent tab's directory is on the other machine, so `zsh` typed there opens nothing and answers `A shell tab cannot be opened from a remote tab.` Each `zsh` command opens a new shell tab, and its interactive zsh reads its startup files. The terminal appears after startup with a plain `> ` prompt. A shell keeps its workspace alive even if you close the tab it was opened from; the clone is removed when its last tab closes.

The terminal is painted in the application theme's own colors — background, text, cursor, and selection — so a light theme gives a light terminal. Choosing a theme in the `theme` picker updates the shell terminal too.

The shell tab's metadata row follows zsh's current working directory as you change it, shortening paths
inside the project to `$root` and paths inside the workspace clone to `$workspace/<name>`. Its file-navigator button opens the navigator in that same directory.

When a command finishes while the zsh tab is hidden, it gets an unread flag. If the flag remains unread and hidden for 30 seconds, Janissary raises the same `Agent '<tab>' is waiting` notification used for harness tabs. Starting another command clears the flag and its pending notification.

`↑` and `↓` recall lines sent from this tab's command bar, including application commands handled there, and commands typed directly into the terminal. `Ctrl+R`, or typing `hist` in the command bar, opens this tab's history; use `↑` and `↓` to choose a line, `Return` to put it back in the bar, and `Escape` to close the history.

Janissary never types anything at zsh's prompt to set the tab up. zsh's own startup does it. So zsh's history holds only what you ran: `history`, `↑` in the terminal, and your history file. It's the same for this tab's history.

`Shift+↑`/`Shift+↓` and `Ctrl+↑`/`Ctrl+↓` scroll the terminal with acceleration. `Page Up` and `Page Down` move by half a screen, and `Escape` returns to the bottom of the scrollback.

Press `Cmd+T`, or the new-shell button in the metadata row, to open another zsh tab in the directory this shell is currently in. Beside an unsandboxed shell the new one is unsandboxed too; beside a sandboxed one it shares the same workspace clone rather than making a new one. While the shell's own clone is still being made, the button is dimmed and `Cmd+T` does nothing. In other tabs, `Cmd+T` opens a new agent tab.

With the command bar focused, `Ctrl+C` sends an interrupt to zsh, unless text is selected in the bar, when it copies that text. `Ctrl+D` sends end-of-input, and `Ctrl+Z` suspends the running command. See [Keyboard shortcuts](/user-documentation/getting-started/keyboard) for these keys and the other shell-tab shortcuts.

With the terminal focused, press `Ctrl+Shift+C` to copy its selection. On macOS, press `Cmd+C`. The copied text is available from your system clipboard and the clipboard-history popup.
