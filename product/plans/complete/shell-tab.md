# Shell tab plugin

**Complexity: 7/10** — the first plugin to own a live process, so it carries a new resource and capability contract on both sides, shared command-bar changes, terminal ownership and teardown, host-state delivery, and input routing across the application and zsh.

**Feature description, verbatim from `product/backlog/features.md` `## ready`:**

> a new `shell tab` implemented as a plugin. The tab contains a pseudo terminal that launches zshell. The tab derives the following features from the agent tab: command line, identical metadata bar, same popups, menus and keybindings.

This bundled plugin opens a live `/bin/zsh` terminal with the agent tab's metadata row and command bar. Its tab is named from the agent-name pool when a name is free, falling back to `shell`, `shell-2`, and so on when the pool is exhausted. The command bar accepts application commands first and routes unclaimed lines to zsh, with `!` forcing the shell. It captures text replies as rendered markdown decorations when xterm can measure them, with styled ANSI text as a fallback. The shell tab owns the terminal process and workspace lifetime, reports zsh's current directory and command state, and provides the applicable application pickers, scheduled and queued commands, status windows, copy context, and key bindings.

## Design decisions

**The tab takes an agent name and is opened by `zsh`.** `shell` is reserved as a core command name, so the plugin claims `zsh`. Each invocation creates a distinct tab named from the agent-name pool by the same rule an unnamed agent launch uses: a name free of every open tab and of every session that could still come back under it. Once the pool is exhausted, the tab is named `shell`, then `shell-2`, and so on.

**The terminal runs `/bin/zsh` with no arguments.** This loads the user's normal startup files and gives the terminal their PATH, aliases, and prompt. Its input is enabled. The command bar has focus on activation; clicking the terminal or pressing `Shift+Tab` from the bar focuses it, and `Shift+Tab` returns to the bar. Keystrokes go to the focused surface.

**Command-bar lines are offered to the application first.** A line matching an application command runs there; an unclaimed line is written to zsh. A leading `!` forces the rest of the line to zsh. The exact `clear` command is sent to zsh, while `/clear` clears the application's output log. Application-intercepted commands and bare picker commands keep their normal behavior. This means a command-name collision requires `!` to reach zsh, including while a shell program is reading input.

**The shell tab uses shared application chrome where available.** It has the published command bar and key handling, task picker, queue picker, theme picker, Quick Open, file navigator, tab navigator, search, clipboard history, and shared completion. Popups that support docked views render over a docked shell tab. Clipboard history inserts at the command-bar caret and remains editable. Terminal selection participates in the application's copy context menu.

The shared command bar also owns application interception, command history presentation, file drops, and the published popup inset. The shell adds its own FIFO drain for lines queued while zsh is busy, the queue popup, shell command and terminal-input history, terminal scroll keys, and `Ctrl+R` for its own history while visible. Bare `hist` opens the same history popup. A command added by `send` or `queue` from another tab enters the shell's bar path; application commands remain application commands, while unclaimed lines reach zsh. Scheduled lines are typed directly into the terminal when due.

**The metadata row is plugin markup.** It follows the agent row's structure and styling, displays the current cwd with `$root` or `$workspace/<name>` shortcuts while retaining absolute paths for actions, exposes file navigator, new-shell, and split actions, and omits the transcript control. Connections and schedule windows use the host's status panels and receive only their declared host-state slices. The connections slice includes the shell's own terminal. The shell's dot follows zsh command state, and finishing a background command raises the ordinary unread badge and delayed waiting notification.

**Terminal ownership follows the tab.** A terminal is spawned only from the payload factory, then adopted by the host under the allocated tab label. Closing the tab releases its process. The client closes the tab when it hears the process exit and checks terminal liveness on mount to handle a shell that exited while no client was connected.

**The shell starts in the issuing tab's working directory.** When that tab belongs to a workspace, the shell uses the same workspace and offline mode. Its cwd follows zsh's OSC 7 reports, so `cd` updates the metadata and file navigator target. A sibling shell inherits the current cwd when it remains inside the project or workspace; otherwise it falls back to the workspace directory or project root. `Cmd+T` opens a sibling shell, and each `zsh` invocation opens a new tab. The workspace remains alive until its final owning tab closes.

**The command bar and terminal share shell history.** Up and Down recall trimmed nonblank commands sent through the bar and commands reported by zsh, with bar-sent commands appearing once. Ghost history remains application-wide. `Ctrl+R` and bare `hist` open the shell's own history while it is visible; the declared chord returns to the application elsewhere. Completion uses the application's completion service. `Ctrl+C`, `Ctrl+D`, and `Ctrl+Z` send terminal control characters while the command bar is focused; `Ctrl+C` copies selected command-bar text instead. `Shift+Tab` stays within the bar and terminal, and shell terminal scrolling follows the transcript's navigation keys.

**The plugin has narrow declared access.** It declares terminal spawning, terminal attachment, command dispatch and completion, liveness, tab operations, and the `connections` and `schedule` host-state slices it renders. A terminal attachment is bound to its owning tab, so the plugin cannot attach to an unrelated terminal.

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

**Server plugin contract.** Add a factory-scoped `spawnTerminal` resource, bounded to the project root and adopted by the tab created from that factory. Declare the shell plugin's server capabilities and host-state slices. Deliver changed declared rows to its handler, and keep terminal attachment and process operations scoped to the owning tab. The plugin opens a fresh tab per `zsh` invocation, starts in the issuing tab's cwd and workspace, answers dispatch and completion intents through the application's command services, and checks terminal liveness when mounted.

**Client plugin.** Add the shell tab body, zsh terminal hook, routing and control-key helpers, history popup, metadata row, and styles. Enable terminal input and focus switching, render command/status surfaces, route command-bar lines, and connect the tab's terminal to the scoped host attachment. Display a running indicator from zsh's command lifecycle markers and close the tab when the process exits.

**Shared application behavior.** Publish the command bar and status-window components to plugin bodies, expose terminal selection for the copy menu, and allow declared plugin chords to take precedence while their tab is active. Preserve ordinary application key handling and route shell-applicable pickers, clipboard insertion, queue editing, and tab actions to the shell tab.

**Product records.** Document the shell tab and the plugin capabilities it uses. Keep `help.md` accurate for `zsh`, command routing, shell history, shell control keys, and shell tab creation.

## Tests

Server tests cover declaration validation, project-root cwd bounds, factory-scoped spawning and cleanup, per-tab terminal attachment ownership, tab creation with the source cwd/workspace, cwd recording, host-state delivery, current-payload intent handling, dispatch output capture and completion, terminal liveness, unread state, scheduled commands, and send/queue delivery. Client tests cover interactive terminal input and focus, command routing and `!`, shell control keys, completion and history (including zsh-reported terminal commands), FIFO queueing, application picker behavior, status display, clipboard insertion, file drops, popup positioning, terminal theme and teardown, and markdown decoration sizing, fallback, clipping, and scrollback visibility. Shared tests cover declared chord precedence, capability scoping, command-bar interception, and status-window behavior.

## Out of scope

- A shell other than `/bin/zsh`, or a shell launched with command arguments instead of its normal interactive startup.
- Reusing the current shell tab for later `zsh` commands.
- Keeping a tab open or offering a restart control after its terminal exits.
- Giving the plugin unrestricted access to the PTY registry or another tab's terminal.
- Replacing the application's existing command, completion, picker, or status-window services with plugin-specific copies.
- Adding a transcript to the shell tab.
- Recording terminal-entered commands in global ghost history; those commands remain in the shell tab's own history and zsh's history.
- Persisting shell tabs, their queues, or their schedules across application restarts.

### Declined during gap research

- Keeping the tab open after the shell exits: the tab closes with its process.
- Renaming the tab after a `cd`: the tab keeps the name it opened with, while the metadata row follows zsh's current directory.
- A `zsh <path>` command form: the tab inherits the issuing tab's current directory.
- A multi-line paste guard: pasted text becomes one editable command-bar line.
- Rectangular block selection: xterm.js's existing selection behavior is used.

## Open questions

None. The command name, terminal program and startup, focus behavior, line routing, working-directory inheritance, terminal ownership, shared chrome, and tab lifecycle are settled by the implementation.

## Verification

Manual review should confirm that `zsh` opens a distinct, agent-named shell tab in the issuing tab's cwd and workspace; zsh startup hooks install before the plain prompt appears; direct terminal input and `Shift+Tab` focus switching work; application commands run in the app, unclaimed lines reach zsh, and `!` forces zsh; queue, send, schedules, history, completion, scroll keys, status windows, unread notifications, clipboard history, drops, and available pickers follow their described routing; theme changes update xterm; markdown replies render as clipped scrollback decorations with styled-text fallback; docked popups sit above the command bar; and closing the tab or exiting zsh releases its process and eventually its workspace.
