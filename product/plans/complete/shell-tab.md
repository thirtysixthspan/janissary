# Shell tab plugin

**Complexity: 7/10** — the first plugin to own a live process, so it carries a new resource and capability contract on both sides, shared command-bar changes, terminal ownership and teardown, host-state delivery, and input routing across the application and zsh.

**Feature description, verbatim from `product/backlog/features.md` `## ready`:**

> a new `shell tab` implemented as a plugin. The tab contains a pseudo terminal that launches zshell. The tab derives the following features from the agent tab: command line, identical metadata bar, same popups, menus and keybindings.

This bundled plugin opens a live `/bin/zsh` terminal with the agent tab's metadata row and command bar. The terminal can receive direct keyboard input when focused. The command bar also accepts application commands and routes other lines to zsh, with `!` forcing the shell. The tab owns the terminal process, reports its working directory and workspace, and provides the applicable application pickers, status windows, context menu, and key bindings.

## Design decisions

**The tab is named `shell` and is opened by `zsh`.** `shell` is reserved as a core command name, so the plugin claims `zsh`; each invocation creates a distinct tab named `shell`, `shell2`, and so on.

**The terminal runs `/bin/zsh` with no arguments.** This loads the user's normal startup files and gives the terminal their PATH, aliases, and prompt. Its input is enabled. The command bar has focus on activation; clicking the terminal or pressing `Shift+Tab` from the bar focuses it, and `Shift+Tab` returns to the bar. Keystrokes go to the focused surface.

**Command-bar lines are offered to the application first.** A line matching an application command runs there; an unclaimed line is written to zsh. A leading `!` forces the rest of the line to zsh. The exact `clear` command is sent to zsh, while `/clear` clears the application's output log. Application-intercepted commands and bare picker commands keep their normal behavior. This means a command-name collision requires `!` to reach zsh, including while a shell program is reading input.

**The shell tab uses shared application chrome where available.** It has the published command bar and key handling, task picker, queue picker, theme picker, Quick Open, file navigator, tab navigator, search, clipboard history, and shared completion. Popups that support docked views render over a docked shell tab. Clipboard history inserts at the command-bar caret and remains editable. Terminal selection participates in the application's copy context menu.

**The metadata row is plugin markup.** It follows the agent row's structure and styling, exposes the applicable file navigator, new-agent, and split actions, and omits the transcript control. Connections and schedule windows use the host's status panels and receive only their declared host-state slices. The shell's dot follows whether a zsh command is running.

**Terminal ownership follows the tab.** A terminal is spawned only from the payload factory, then adopted by the host under the allocated tab label. Closing the tab releases its process. The client closes the tab when it hears the process exit and checks terminal liveness on mount to handle a shell that exited while no client was connected.

**The shell starts in the issuing tab's working directory.** When that tab belongs to a workspace, the shell uses the same workspace and offline mode. `Cmd+T` in the shell command bar opens another shell in the same directory and workspace. Each invocation opens a new tab.

**The command bar maintains its own history.** Up and Down recall lines it sent, ghost history offers application-wide history, and `Ctrl+R` opens the shell's sent-line picker while the shell tab is visible. The declared chord is returned to the application on other tabs. Completion uses the application's completion service. `Ctrl+C`, `Ctrl+D`, and `Ctrl+Z` send the corresponding terminal control characters; `Ctrl+C` copies selected command-bar text instead.

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

Server tests cover declaration validation, project-root cwd bounds, factory-scoped spawning and cleanup, per-tab terminal attachment ownership, tab creation with the source cwd/workspace, host-state delivery, dispatch and completion, and terminal liveness. Client tests cover interactive terminal input and focus, command routing and `!`, shell control keys, completion and history, application picker behavior, status display, clipboard insertion, and terminal teardown. Shared tests cover declared chord precedence, capability scoping, and status-window behavior.

## Out of scope

- A shell other than `/bin/zsh`, or a shell launched with command arguments instead of its normal interactive startup.
- Reusing the current shell tab for later `zsh` commands.
- Keeping a tab open or offering a restart control after its terminal exits.
- Giving the plugin unrestricted access to the PTY registry or another tab's terminal.
- Replacing the application's existing command, completion, picker, or status-window services with plugin-specific copies.
- Adding a transcript to the shell tab.

### Declined during gap research

- Keeping the tab open after the shell exits: the tab closes with its process.
- A tab name that follows `cd`: the metadata row reports the directory where the shell started.
- A `zsh <path>` command form: the tab inherits the issuing tab's current directory.
- A multi-line paste guard: pasted text becomes one editable command-bar line.
- Rectangular block selection: xterm.js's existing selection behavior is used.

## Open questions

None. The command name, terminal program and startup, focus behavior, line routing, working-directory inheritance, terminal ownership, shared chrome, and tab lifecycle are settled by the implementation.

## Verification

Manual review should confirm that `zsh` opens a distinct shell tab in the issuing tab's cwd and workspace; the terminal accepts input after focus moves to it; `Shift+Tab` returns focus to the bar; application commands run in the app, unclaimed lines reach zsh, and `!` forces zsh; shell history, completion, control keys, status windows, clipboard history, and available pickers work in the shell tab; docked pickers appear over the shell; and closing the tab or exiting zsh releases the process.
