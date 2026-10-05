# Shell tab plugin

**Complexity: 7/10** — the first plugin to own a live process, so it carries a new resource and capability contract on both sides, shared command-bar changes, terminal ownership and teardown, host-state delivery, and input routing across the application and zsh.

**Feature description, verbatim from `product/backlog/features.md` `## ready`:**

> a new `shell tab` implemented as a plugin. The tab contains a pseudo terminal that launches zshell. The tab derives the following features from the agent tab: command line, identical metadata bar, same popups, menus and keybindings.

This bundled plugin opens a live `/bin/zsh` terminal with the agent tab's metadata row and command bar. Each invocation opens a distinct tab named from the agent-name pool, avoiding names held by open tabs and live or reconnectable harness and agent sessions; it falls back to `shell`, `shell-2`, and so on when the pool is exhausted. The command bar offers application commands first, routes unclaimed lines to zsh, and accepts `!` to force a line to the shell. The plugin owns the terminal process and workspace lifetime, reports zsh's current directory and command state, and provides the applicable application pickers, scheduled and queued commands, status windows, clipboard actions, and key bindings. Text replies render as markdown decorations when xterm can measure and place them, with styled terminal text as the fallback.

## Design decisions

**The tab is named from the agent pool and opened by `zsh`.** `shell` is a reserved core command name, so the plugin claims `zsh`. Each invocation creates a distinct tab named by the same launch-name check as an unnamed agent, including session rows that may reconnect. Once the pool is exhausted, the tab is named `shell`, then `shell-2`, and so on. A shell keeps its opening name when its working directory changes.

**The terminal runs `/bin/zsh` with no arguments.** This loads the user's normal startup files and gives the terminal their PATH, aliases, and prompt. The tab sets the prompt to `> ` after installing its status hooks. The command bar has focus on activation; clicking the terminal or pressing `Shift+Tab` from the bar focuses it, and `Shift+Tab` returns to the bar. Keystrokes go to the focused surface.

**Command-bar lines are offered to the application first.** A line matching an application command runs there; an unclaimed line is written to zsh. A leading `!` forces the rest of the line to zsh. The exact `clear` command is sent to zsh, while `/clear` clears the application's output log. Application-intercepted commands and bare picker commands keep their normal behavior. A line answered by the application displays its command and markdown reply in the terminal. Slow application work is exempt from the plugin handler deadline; reply capture returns the output so far after 30 seconds while the command continues running.

**The shell tab uses shared application chrome where available.** It has the published command bar and key handling, task picker, queue picker, theme picker, Quick Open, file navigator, tab navigator, search, clipboard history, and shared completion. Picker state and actions are scoped to the tab that opened them. A docked shell opens pickers over itself; a hidden shell opens none, so it cannot take keys from the visible tab. The queue popup edits only the shell whose bar it is over. Clipboard history inserts at the command-bar caret and remains editable. Terminal selection participates in the application's copy context menu and `Ctrl+Shift+C` (or macOS `Cmd+C`) writes the selection through the shared clipboard helper.

The shared command bar owns application interception, command history presentation, file drops, and popup positioning. The shell adds its own FIFO drain, queue popup, shell command and terminal-input history, terminal scroll keys, and `Ctrl+R` for its own history while the shell is the keyboard target. Bare `hist` opens the same history popup. A directly submitted line is held by the queue until it settles, preventing a later submission from overtaking it before zsh reports its command marker. Multi-line lines sent to zsh use one bracketed paste and one submit key. A command added by `send` or `queue` from another tab enters the shell's bar path; application commands remain application commands, while unclaimed lines reach zsh. Scheduled lines are typed directly into the terminal when due. Only the shell plugin drains its queue; the host's agent queue drain never runs shell entries in a background command shell.

**The metadata row is plugin markup.** It follows the agent row's structure and styling, displays the current cwd with `$root` or `$workspace/<name>` shortcuts while retaining absolute paths for actions, exposes file navigator, new-shell, and split actions, and omits the transcript control. Connections and schedule windows use the host's status panels and receive only their declared host-state slices. Host-state fingerprints live on each tab and include its instance key, so changed rows or a changed key trigger delivery while a closed tab carries no delivery memory forward. The connections slice includes the shell's own terminal. The shell's dot follows zsh command state through a declared busy capability, and finishing a background command raises the ordinary unread badge and delayed waiting notification.

**Terminal ownership follows the tab.** A terminal is spawned only from the payload factory, then adopted by the host under the allocated tab label. Closing the tab releases its process; a factory failure after spawning also releases it. The client closes the tab when it hears the process exit and checks terminal liveness on mount to handle a shell that exited while no client was connected. A new tab records the directory its terminal actually started in, including a fallback directory, rather than temporarily inheriting a source directory the process did not use.

**The shell starts in a bounded local directory.** A local source tab's cwd is used when it resolves inside the project root. A workspaced source carries its workspace and offline mode, and the cwd is used only when it resolves inside that workspace; otherwise the shell starts at the workspace root. Without a workspace it falls back to the project root. A remote agent source is rejected with `A shell tab cannot be opened from a remote tab.` A terminal start outside the project root or a PTY spawn failure is a request rejection, not a plugin failure, so other shell tabs stay open. A sibling shell inherits the current cwd when it remains inside the allowed bound; otherwise it uses the workspace root or project root. `Cmd+T` opens a sibling shell, and each `zsh` invocation opens a new tab. The workspace remains alive until its final owning tab closes.

**The shell trusts only its own status markers.** The hooks carry a random 32-character lowercase hexadecimal nonce embedded in their function bodies, not an environment variable. The server records the first hook-install claim in the tab payload; later mounts reuse that nonce and do not type setup into the terminal again. A marker without the stored nonce cannot change command state, history, cwd, or terminal visibility. Commands and cwd reports are base64-decoded as UTF-8. The cwd is accepted only as an absolute path in normal form and is recorded exactly as zsh reported it. Text written by the command bar or used for a reply has terminal control sequences removed, except newline and tab, so it cannot end a bracketed paste early or change terminal state.

**The command bar and terminal share shell history.** Up and Down recall trimmed nonblank commands sent through the bar and commands reported by zsh, with bar-sent commands appearing once. Ghost history remains application-wide. The injected status-hook setup command is excluded from shell history. `Ctrl+R` and bare `hist` open the shell's own history while it is the keyboard target; the declared chord returns to the application elsewhere. Completion uses the application's completion service. `Ctrl+C`, `Ctrl+D`, and `Ctrl+Z` send terminal control characters while the command bar is focused; `Ctrl+C` copies selected command-bar text instead. `Shift+Tab` stays within the bar and terminal, and shell terminal scrolling follows the transcript's navigation keys.

**The plugin has narrow declared access.** It declares terminal spawning, terminal attachment, command dispatch and completion, liveness, tab operations, command-bar hosting, per-tab busy and unread state, and the `connections` and `schedule` host-state slices it renders. A terminal attachment and line-queue operation are bound to tabs the plugin owns, so the plugin cannot attach to another tab's terminal, change an agent queue or cwd, or drain a different plugin's queue. `Ctrl+R` and `Cmd+T` are declared chord claims: each runs only when the shell is the keyboard target, including when focus rests on the current shell page, and never steals the chord from an agent beside a docked shell.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| PTY process registry, input, resize, output, and per-tab release | `src/pseudoterminal-manager.ts` |
| Terminal event and RPC transport | `src/protocol/` and `src/controller/tab-adapter.ts` |
| Published command bar, shared pickers, and application key handling | `web/src/plugins/api.ts` and `web/src/shared/` |
| Host status rows and their windows | `src/tab/view.ts` and `web/src/shared/status-windows/` |
| Terminal selection registration and theme colors | `web/src/shared/terminal/` |
| Plugin declaration, resource factory, and lifecycle | `src/plugins/` and `web/src/plugins/` |

## Proposed changes

**Server plugin contract.** Add factory-scoped terminal spawning, bounded to the project root and adopted by the tab created from that factory. Declare the shell plugin's server capabilities and host-state slices. Deliver changed declared rows only when their fingerprint changes, keep terminal attachment and line operations scoped to the owning tab, and share command-output capture with messaged commands. Exempt host-run application commands from the plugin deadline while bounding the shell's reply wait. Open a fresh named tab per `zsh` invocation, start it in the source's allowed cwd and workspace, reject remote sources and terminal-start errors as bad requests, and check terminal liveness when mounted.

**Client plugin.** Add the shell tab body, terminal hook, routing and control-key helpers, history popup, metadata row, and styles. Install nonce-authenticated status hooks once per terminal, reattach without disturbing foreground programs, record exact base64-encoded cwd reports, and exclude hook setup from history. Enable terminal input and focus switching, route command-bar lines through application commands first, queue submissions in FIFO order, frame multiline shell submissions as one paste, strip terminal controls from submitted and displayed text, render markdown replies with link handling and styled-text fallback, and close the tab when the process exits.

**Shared application behavior.** Publish the command bar, caret insertion, and status-window components to plugin bodies, scope command-bar state and picker selection to each body, and let declared plugin chords take precedence only for their owning visible tab. Keep busy and unread dots in host tab state, restore status-window auto-show for agent, editor, and harness callers, and prevent the host's agent queue drain from consuming plugin queues. Preserve ordinary application key handling and route shell-applicable pickers, clipboard insertion, queue editing, file drops, tab actions, and terminal copy through shared services.

**Product records.** Keep the behavior specs for shell tabs and their shared integrations aligned with the implementation. Keep `help.md` accurate for `zsh`, command routing, shell history, terminal controls, queue behavior, and shell tab creation.

## Tests

Server coverage includes declaration validation, name allocation against session rows, cwd containment, remote-source refusal, factory-scoped terminal spawning and cleanup, recording the actual spawned cwd, terminal attachment ownership and teardown, host-state fingerprints, current-payload intent handling, dispatch capture and deadline handling, liveness, busy and unread state, scheduled commands, and send/queue delivery. Client coverage includes authenticated markers, one-time hook installation and reattachment, terminal input and focus, command routing and control keys, completion and history, FIFO queueing, application picker source and visibility, status display, clipboard insertion and copy, file drops, popup positioning, theme handling, terminal-control stripping, multiline framing, markdown links and decorations, fallback rendering, clipping, and scrollback visibility. Shared tests cover chord targeting, capability scoping, command-bar interception, output capture, and status-window behavior.

## Out of scope

- A shell other than `/bin/zsh`, or a shell launched with command arguments instead of its normal interactive startup.
- Reusing the current shell tab for later `zsh` commands.
- Keeping a tab open or offering a restart control after its terminal exits.
- Giving the plugin unrestricted access to the PTY registry or another tab's terminal or queue.
- Replacing the application's existing command, completion, picker, or status-window services with plugin-specific copies.
- Adding a transcript to the shell tab.
- Recording terminal-entered commands in global ghost history; those commands remain in the shell tab's own history and zsh's history.
- Persisting shell tabs, their queues, or their schedules across application restarts.
- Replaying terminal scrollback after a browser remount.
- Running a shell on a remote host; opening `zsh` from a remote tab is refused.
- Recording paths that are not valid UTF-8, or stripping terminal controls from PTY output produced by zsh itself.

## Open questions

None. The command name, terminal program and startup, focus behavior, line routing, working-directory bounds, terminal ownership, shared chrome, marker trust, and tab lifecycle are settled by the implementation.

## Verification

Manual review should confirm that `zsh` opens a distinct agent-named tab within the issuing tab's allowed directory and workspace; remote sources and terminal-start failures are rejected without disabling the plugin; startup hooks install once and authenticate markers; direct terminal input and `Shift+Tab` focus switching work; application commands run in the app, unclaimed lines reach zsh, and `!` forces zsh; queues, send, schedules, history, completion, scroll keys, status windows, unread notifications, clipboard actions, drops, and source-scoped pickers follow their described routing; theme changes update xterm; multiline input is submitted as one paste; submitted and displayed text cannot inject terminal controls; markdown replies render as scrollback decorations with links and styled-text fallback; docked popups sit above the command bar; and closing the tab or exiting zsh releases its process and eventually its workspace.
