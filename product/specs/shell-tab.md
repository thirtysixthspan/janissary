# Shell Tab

A **shell tab** is a tab whose body is a live pseudo terminal running zsh, laid out exactly like an
agent tab: the metadata row on top, the terminal where the transcript would be, and the command line
beneath it. Type `zsh` in any tab's command bar to open one; by default it gets a sandboxed workspace clone
of its own, as `agent` does (see "Where the shell starts"). `zsh <name>` names the tab. Without a name, each
shell tab is named from the agent-name pool exactly as an unnamed agent tab is — a name no open tab already holds, and no harness or agent
session that is provisioning, active, reconnecting, or detached still holds (see "Name clashes" in [[agents]])
— and the tab strip shows that name, so two shells read as two distinct tabs and either can be
addressed by name. A shell therefore never takes the name of a detached remote agent that could come
back under it. Once every name in the pool is held, a new shell tab is named `shell`, then `shell-2`,
and so on.

Every launch opens one shell tab of its own, before any other tab exists: the **launch shell**,
labelled `janus` rather than given a pool name, started in the project directory with no workspace,
in the first palette colour and group 1 (see [[tabs]]). It is an ordinary shell tab in every other
respect — `exit` closes it, and as the last tab that quits the app — and the application opens it
through the same plugin as `zsh`, from no tab at all.

The launch shell is the visible tab when the window first appears, and its command bar holds the
keyboard focus, not its terminal. The first thing typed after launch goes to the `janus` command bar
without a click. A window that opens without operating-system focus keeps the command bar as its
focused element, so the keyboard lands there as soon as the window is activated.

The tab is contributed by a **bundled tab plugin** rather than by the application core (see
[[tab-plugins]]). Nothing about it changes because of that: `zsh` is in every build, and what
follows describes the behavior.

## Choose where keys go

The shell tab has two keyboard surfaces: the command bar and the terminal. The command bar is focused
when the tab opens. Double-click the terminal or press `Shift+Tab` from the command bar to type directly into
zsh; a single click on the terminal returns focus to the command bar. Press `Shift+Tab` again to return
to the command bar. Both `Shift+Tab` transitions prevent the browser's
default focus traversal, and keystrokes go to whichever surface has focus. A thin line runs down the
terminal's left edge, just inside the tab's own frame, to show which surface that is: it is lit in the
tab's colour while the keyboard is in the terminal, and dim while it is in the command bar or anywhere
else. The line takes no columns from the terminal, and the terminal's text is set in from it so the two
never touch. The terminal's own prompt and cursor follow the same rule. While the keyboard is in the
terminal, zsh's waiting prompt and the blinking cursor show as usual. While it is anywhere else, the
terminal shows neither, so the command bar's prompt is the only one on screen. Only the prompt zsh is
waiting at is hidden: the prompts on earlier command lines stay in the scrollback, and a program
running in the terminal is drawn as it is. Inside a shell tab,
`Shift+Tab` belongs to the tab: the application's section cycling, which takes the chord everywhere
else, does not move focus out of it.

The command bar offers application commands before sending an unrecognized line to zsh. Typing
directly in the terminal sends keys to zsh without that application routing.

Another tab can run `send <shell-tab> <text>` to submit a line through this shell's command bar.
Application commands run in the app; an unclaimed line goes to zsh. The line joins the shell's FIFO
queue, so it waits for zsh's prompt when the shell is busy. The sender records the ordinary `send`
confirmation; command output stays in this shell tab.

The shell tab's status dot blinks while zsh is running a command and stops when zsh returns to its prompt. That holds with any number of shell tabs open: a command finishing at the same moment zsh reports its working directory still stops the dot, and the reported directory is still recorded. The shell lights the dot through the `setBusy` capability each time zsh reports a command starting or finishing; the tab strip itself reads nothing from the shell's payload (see [[tab-plugins]]).

When a shell command finishes while its tab is hidden and undocked, the tab gets the unread badge. A visible or docked shell tab does not. The badge clears when the shell starts working again, or after the tab has been active for the unread dwell. If the badge remains unread and hidden for thirty seconds, the app raises the same `harness-idle` waiting notification used for harness tabs; raising the badge arms that notification only when the tab was eligible, and clearing the badge cancels it.

**A command-bar line means one of two things.** A leading `!` forces the shell: the rest of the line is sent to
zsh and nothing else happens. Without it, the line is offered to the application first — if it names a
command, that command runs in this tab and the shell never sees it; if it names nothing, the line
goes to zsh. So `ls` runs a shell command and `theme` opens the theme picker, and a word that
collides with a command name is swallowed by the command. A shell waiting at a `read` prompt, or
asking for a password, cannot be given `theme` or `files` without the `!` prefix. The command bar
warns about none of this; `!` is the override, and it is documented in `help`. The bare `clear`
command is sent directly to zsh so it clears the terminal, while `/clear` still clears the app transcript.

First refusal means what it says. A line the application answers itself — a bare word that opens a
picker, `quit` or `/quit`, or `close` or `/close` that would take the last tab with it — is answered
here rather than sent onward. A quit typed in a shell tab asks the same confirmation it asks anywhere
else (see [[quit-confirmation]]), and a bare word opens the same picker.

`nav`, or `nav <query>`, submitted from the shell command bar opens the fuzzy tab navigator over the
shell tab, pre-filled with the query, exactly as it does from an agent tab's bar; submitting `nav`
while the navigator is open closes it. Neither reaches zsh. The shell draws its overlays from the
same overlay stack as an agent tab, so one navigator appears over it, whether `nav` or `Ctrl+G`
opened it.

The bare `theme` picker appears over the shell tab. While it is open, the application's arrow,
Return, and Escape handling controls the selection, applies the chosen theme, or dismisses the picker.
If the shell tab is docked in a sidebar, the picker appears over that shell there; its keys stay with
the picker and are not sent to zsh. The terminal content is painted in the application theme's own
colors — its background, text, cursor, and selection match the rest of the tab, so a light theme
gives a light terminal — and they change with the theme, including when the picker applies a
different one. The padding between the focus line and the terminal text takes the same theme
background, so no dark strip shows beside the text under a light theme. Harness terminals keep their shared dark terminal colors.

While zsh is running a command, the command line reads `queue >`. A line submitted then goes into the
shell tab's command queue instead of reaching zsh or the application, and it is recorded in the bar's
history as it is queued. When zsh returns to its prompt, the queue drains one line at a time, oldest
first: each line runs exactly as if it had just been submitted, and a line sent to zsh waits for zsh's
next prompt before the following entry runs. Lines the application answers itself run straight on to
the next entry. A line submitted while the queue is still draining joins the back of the queue, so
nothing overtakes a line already waiting. The same holds from the moment a bar line is submitted to
an idle shell: until that line settles, and when it went to zsh until zsh's next prompt, a further
line is queued even though zsh has not yet reported the first one as running. Typing `ssh host` and
then `ls` quickly therefore queues `ls` rather than typing it into the program `ssh host` starts.
Keys typed directly into the terminal are never queued.

Another tab can append a line with `queue <shell-tab> <command>`. The line joins the same FIFO as
commands queued from this shell's own bar. If zsh is idle, it runs right away through the shell bar's
application-command routing; if zsh is busy, it waits for the prompt before draining. That holds
whether the shell is the current tab, docked in a sidebar, or hidden behind another tab: the shell
watches its own queue, and a line queued for a different tab never makes it look for one. `send
<shell-tab> <text>` queues the same way. The issuing tab records `→ <shell-tab> (queued): <command>`.

The `queue` command and `Ctrl+E` open the application's queue popup over the shell tab. The selected
queued line appears in the shell command bar; typing edits it, and Backspace or Delete on an empty bar
removes it. Arrow keys change the selected queue entry, Return leaves the popup open without submitting,
and Escape closes it and clears the bar. Only the shell the popup is open over takes part: a popup
opened over an agent tab, or over another shell, leaves every other shell's unsent line and focus
exactly as they were, and typing into one of those bars edits no queue entry.

An application command that answers with text rather than opening something — `help`, for one — is
shown in the terminal as a command line, followed by its reply on the next line. The reply is markdown, as
it is in an agent tab's transcript, and is rendered for the terminal rather than shown as raw markup:
headings and bold text are bold, the top heading underlined, italic and struck-through text keep
their styles, inline and fenced code is colored and code blocks are indented, list items get bullets
or numbers, quotes get a bar, links show their target after the text, and tables are lined up in
columns under a bold header. Neither line is sent
to zsh. Commands that open a picker keep their existing behavior.

A slow application command never disables the shell. Its runtime is not charged to the shell plugin's
handler deadline (see [[tab-plugins]]), so a command that takes longer than five seconds — another
plugin's command, a large `open`, an agent launch — leaves every shell tab and its zsh process open.
The reply waits for the command for at most 30 seconds. A command still running then shows the output
it had produced so far, and keeps running.

When the terminal is in its normal buffer and can measure the reply, it is rendered as HTML — the same
markdown rendering an agent tab's transcript uses, in the terminal's theme colors — in a block placed
in the terminal's scrollback directly under the echoed command and followed by zsh's prompt. Its
rendered content fits the block without an internal scrollbar, and the reply scrolls with the
terminal without adding an application-window scrollbar. The decoration stays inside the terminal
body and never covers the metadata row or tab strip. Its visible portion stays rendered while
scrolling through it, even when its first row is above the viewport. The block is not terminal text,
so terminal selection and search do not see it. When a full-screen program holds the terminal, or the reply cannot
be measured or placed, it falls back to the styled terminal text described above.

A link in a reply rendered as HTML opens the way the same link opens from an agent tab's transcript: a
web address opens through `open`, and a `path:line` reference opens in an editor tab. A click on any
link in the block never navigates the application window, so a link the application does not open
does nothing.

**Tab completion is the application's.** `Tab` in the command line asks the same completion the agent
tab's bar asks, and shows the same strip when there is a choice to make. The shell tab keeps no list
of its own. One match completes the line, several matches show the choice strip with two spaces
between choices, and no matches leave
the line unchanged. When several choices are visible, `Escape` closes the strip and leaves the
command line unchanged.

`Ctrl+A` and `tasks` open the shared task picker over the shell tab. Choosing a task inserts its
`execute …` command at the shell command bar's caret and leaves it there for you to edit or submit.
The shared pickers and the queue popup treat the shell this way because its declaration carries
`hostsCommandBar`, not because the application knows the shell plugin by name (see [[tab-plugins]]).

A picker opened from a shell's bar belongs to that shell, including a shell docked in a sidebar while
an agent tab is current. It appears over the shell, a task picked from `tasks` lands in the shell's
bar rather than the agent's, and `queue` lists, edits and deletes the shell's own queued lines rather
than the agent's. If the shell closes while its picker is open, the picker moves to the current tab
and acts on that tab instead.

A shell that is not on screen opens no picker. That covers a shell hidden behind another centre tab
and a docked shell behind another entry in its sidebar. A picker word reaching it, such as a queued
`tasks`, `queue`, `theme` or `nav` line draining in the background, is recorded in the bar's history
and the queue moves on to its next line. Nothing appears, so no unseen picker takes the arrow, Return
and Escape keys from the tab in front.

The command bar's status dot uses the same color as the shell tab's dot.

## Keys

`Cmd+T` opens another zsh tab beside this shell, exactly as the metadata row's **new shell here** button does. The new shell starts in the same working directory. Beside an unsandboxed shell it is unsandboxed; beside a sandboxed one it runs inside the same workspace clone with the same offline setting. It never creates a workspace, which is what sets it apart from a typed `zsh`. While this shell's own clone is still provisioning, `Cmd+T` does nothing. In other tabs, `Cmd+T` keeps opening a new agent tab.

`Cmd+T` works the same with the terminal focused as with the command bar focused, and when the keyboard rests on the page with the shell as the current tab. It is a chord the shell plugin's declaration claims beside `Ctrl+R`, so like `Ctrl+R` it belongs to the shell only while the shell is the visible tab, or the selected entry in the sidebar it is docked to. `Cmd+T` pressed in an agent tab's command bar beside a docked shell still opens a new agent tab.

`Ctrl+C`, `Ctrl+D` and `Ctrl+Z` in the command line send interrupt, end-of-input and suspend to the
shell — the characters a terminal would send. The terminal also accepts direct input when focused.
`Ctrl+C` copies the command line's own selection instead when it holds one, so copying by keyboard
still works.

With the terminal focused, `Ctrl+Shift+C` copies its selection; on macOS, `Cmd+C` does the same. The
copy uses the shared clipboard writer, so the text is available from the system clipboard and the
clipboard-history popup.

`Shift+↑`/`Shift+↓` and `Ctrl+↑`/`Ctrl+↓` scroll the terminal with acceleration. `Page Up` and
`Page Down` move by half a terminal screen, and `Escape` returns to the bottom of the scrollback.

`Up` and `Down` walk the tab's command history, exactly as the agent tab's bar walks its tab's command
history. It holds the lines the command bar has sent or the application has handled, and every command
typed directly into the terminal, in the order they ran. A line sent from the bar appears once, as it
was typed in the bar, even though zsh also reports running it; a command typed into the terminal is
recorded as zsh received it, including one spanning several lines. Every entry is stored without
leading or trailing whitespace, and a command that is empty or only whitespace is never recorded.
The status hooks the tab installs in its shell are setup, not user commands, and never appear in this
history. They never appear in zsh's own history either: nothing is typed at the prompt to install
them, so `history`, `Up` in the terminal, and `$HISTFILE` hold only what the user ran.
Ghost suggestions instead draw from the
global history shared across tabs and runs (see [[history]]); `→` or `End` at the end of input accepts
a suggestion. Every line the command bar records in this history — whether the application answered
it or it went to zsh, a `!` line included — enters that global history too, attributed to this tab,
as a line submitted in an agent tab's bar does. Commands typed directly into the terminal, and lines
another tab delivers with `send` or `queue`, do not.

Every other chord belongs to the application, unchanged: `Ctrl+A` opens the task picker, `Ctrl+G` the
tab navigator, `Cmd+P` quick open and `Cmd+Shift+F` the project search, all with the cursor in the
command bar, exactly as in an agent tab. `Ctrl+E` opens the queue popup over the shell tab, as
described above. `Cmd+F` does nothing here — a plugin tab has no transcript to search — which is the
same in every plugin tab.

`Ctrl+R` opens this tab's own history while it is the visible one, and a bare `hist` submitted from the
command bar opens the same list rather than the application's history picker, which a shell tab's
command line never adds to. `hist` itself is not added to the list. It lists the tab's command
history — the lines its command bar has sent and the commands typed into its terminal — oldest first
with the newest line selected at the bottom. It uses the same presentation and
keyboard navigation as the application's history picker — a multi-line command shows as its first line
with a `(N lines)` postfix, and is put back whole — but Return puts the selected line back in the
command bar without running it. Focus any other tab and `Ctrl+R` opens the application's history picker
again. That holds for a docked shell too: while it shows in a sidebar, `Ctrl+R` pressed in an agent
tab's command bar opens the application's picker, however many shells are docked. A shell that is the
current tab keeps the chord when the keyboard rests on the page itself, such as after a click on its
metadata row.

The list is driven by the keyboard without ever taking it from the command bar: `↑`/`↓` move the
selection, `Return` puts the chosen line back in the bar, and `Escape` closes it. Picking a row with
the mouse does the same, and either way the bar is where the keyboard is afterwards, so a recalled line
can be edited or run.

## The metadata row

The row shows the shell's current working directory, shortened to `$root` or `$workspace/<name>`
when it is inside the project or workspace clone. The stored directory stays absolute for shell actions.
It shows a workspace mark when that directory is a workspace clone, and the actions a shell tab can
act on: **open file navigator here**, **new shell here**, the split control, and the connections and
schedule windows.

While a shell's workspace clone is still provisioning, the row shows the spinning sync icon titled
`Provisioning workspace` in the workspace mark's place, as an agent tab does, and the terminal area
stays empty. The **new shell here** button is disabled and dimmed, with the tooltip `Waiting for the
workspace`. **Open file navigator here** stays available and opens on the clone. Once zsh starts, the
flag gives way to the workspace mark and the button comes back.

It also carries the **recording** flag — a film icon, drawn before the workspace mark — which reports
that this shell's session is being recorded and opens the recording when pressed. It is drawn plain
and inert until the shell has printed something, green and pressable from that moment on, and stays
green and pressable once the recording has stopped, so a partial recording is still reachable. See
[[harness-recording]] § The recording flag.

The connections window includes the tab's own `zsh` terminal as soon as the shell tab opens. The
connections and schedule windows auto-show for five seconds whenever the tab becomes visible, then
fade over 300 ms unless pinned or hovered. If an empty window gains its first row after that interval,
it auto-shows again; a window with no rows stays hidden.
Both popups begin below the metadata row, which remains visible.

A shell tab can hold scheduled commands (see [[scheduling]]): `schedule` from its own command bar, or
`schedule … in <shell tab>` from another tab, attaches the entry to it, and the "New schedule" dialog
offers it as a target. Its entries appear in the schedule window. When one falls due, the command is
typed into zsh as a line, exactly as if entered at the terminal. The schedule lives as long as the tab.

`send`, `queue`, and `schedule` accept a plugin tab as a target by one rule: the tab owns a live
terminal (`ownsTerminal` in `src/tab/plugin-terminals.ts`). They share that check so they cannot
disagree about which shell tabs take input. `send` and `queue` also accept a shell whose workspace
clone is still provisioning: the line joins that shell's command queue with the usual confirmation
(`→ <shell>: <text>` or `→ <shell> (queued): <command>`) and runs once zsh starts. `schedule … in
<shell>` is still refused until zsh has started, because a schedule types into a terminal that does
not exist yet. A plugin tab without a terminal answers `send` with
`Tab "<label>" does not accept input.`, answers `queue` with `Tab "<label>" has no command queue.`,
refuses `schedule … in <label>` with `Tab "<label>" cannot run scheduled commands.`, and is not
offered as a target in the "New schedule" dialog.

There is no **open transcript** control, because there is no transcript: the terminal replaced it. The
working directory shown follows the shell's current directory. It updates after a `cd` and when zsh
returns to its prompt after a command. A reported directory is recorded only when it is an absolute
path in normal form, with no `.` or `..` segment, no doubled slash, and no trailing slash beyond the
root. zsh always reports its directory that way, so any other report is refused and the recorded
directory stays where it was.

The directory is recorded byte-for-byte as zsh holds it. zsh sends `$PWD` base64-encoded rather than
inside a `file://` URL, so a directory whose name contains `#`, `?`, `%`, a literal `%41`, a backslash,
a space, or non-ASCII text is recorded exactly, not truncated, decoded a second time, or rewritten. A
report whose payload is not base64 of UTF-8 text, including one in `file://` URL form, is ignored and
the recorded directory stays where it was. The report names no host: only the zsh the tab installed
its hooks in can sign one, and that zsh always runs on the local machine, so a report from another
host, such as one an `ssh` session prints, never carries the nonce and is ignored.

The tab trusts only the markers its own zsh hooks print. The hooks are installed with a random nonce,
generated once per shell, and every marker they emit carries it: the
command-start marker (`OSC 133;C;<nonce>;<base64 command>`), the prompt marker (`133;D;<nonce>`), the
setup-complete marker (`133;E;<nonce>`) and the directory report (`OSC 7;<nonce>;<base64 path>`).
The nonce is written into the hook functions themselves, never into a shell variable a child process
could read. A marker without the right nonce is ignored, so a program's output — a `cat` of a crafted
file, or a remote host reached over `ssh` — cannot mark the shell busy or idle, add a command to this
tab's history, change the recorded directory, or clear the terminal. The server mints the nonce when
it starts the shell and keeps it in the tab's payload (`hookNonce`) for the life of the shell, so
every attach reads it from there and trusts the markers of the hooks already running. It reaches zsh
in an environment variable that zsh's startup removes before any of the user's own startup files
run, so no process the shell starts inherits it, and no file on disk ever holds it. A `hookNonce`
must be 32 lowercase hex characters, because it is written into the hook functions zsh runs.

## Where the shell starts

The command is `zsh [name] [-w|--workspace|--no-workspace] [--offline]`, read the way `agent` reads
its own. A typed `zsh` creates a new sandbox by default, wherever it is typed, a sandboxed tab included:
a fresh `git clone` of the project's `origin` under `.janissary/workspace/<name>/`, with zsh confined to
it by the same Seatbelt profile and credential injection an `agent -w` gets (see [[workspaced-agent]]).
`-w` and `--workspace` confirm the default. `--no-workspace` opts out and wins when both are given.
`--offline` provisions the clone with the offline sandbox profile, which denies network access, and
changes nothing without a workspace. Flags match case-insensitively.

The words after `zsh` that are not flags form the name, lowercased, as `agent <name>`'s do. The name is
the tab's label and, for a workspaced shell, the clone's folder. A typed name is held to `agent`'s rules:
one that clashes with an open tab or a live session is refused, a workspaced name must be a single
folder name, and a leftover folder under it is removed before cloning, with `agent`'s notifications-feed
messages for each. Without a name the shell is named as described above.

`zsh … on <address>` is refused with `Remote shell tabs are not supported yet.` and nothing opens. A
word starting with `-` that is not one of the four flags is refused with `Unknown option "<word>".
Usage: zsh [name] [-w|--workspace|--no-workspace] [--offline]` and nothing opens; unlike `agent`, such a
word never becomes part of the name.

A workspaced shell's tab opens at once, while the clone runs, and zsh starts confined to the clone, at
its root, when the clone finishes. With no git repository, or no readable `origin` remote, a typed `zsh`
still opens a shell, unsandboxed exactly as `--no-workspace` would, and answers `Shell "<name>" has no
workspace: <reason>.`, where the reason is `no git repository found` or `the repository has no "origin"
remote`.

An unsandboxed shell — `zsh --no-workspace`, or that fallback — never starts inside another tab's clone.
It starts where `agent --no-workspace` does: in the issuing tab's working directory when that tab is
local, has no workspace, and is inside the project checkout, and at the checkout root otherwise. The
**new shell here** button and `Cmd+T` are the way to open another shell inside an existing clone.

A shell's starting directory must be inside the project root, and a shell cannot be started anywhere
else: a terminal only ever runs in a directory inside that root. A remote agent tab is therefore not a
place a shell tab can be opened from — its working directory belongs to the other host, and there is
nothing here to start a shell in. `zsh` typed in a remote agent tab answers that tab with `A shell tab
cannot be opened from a remote tab.` and opens no tab, rather than starting a local shell the user
could mistake for one on the remote host. The shell plugin learns the tab is remote from the
`remote` flag on `originTab()`, and the refusal is a rejection, so the plugin stays enabled.

Whether a directory is inside the project root, or inside the workspace clone, is judged on the path
it resolves to, not the path as written, so `/repo/a/../../etc` is outside `/repo`. A terminal the
application refuses to start, or one that fails to start, answers that one request in the issuing tab
(`Cannot start a terminal in <dir>: it is outside the project root <root>.`, or `Cannot start a
terminal in <dir>: <reason>.`) and opens no tab. Every other shell tab and its zsh keep running, and
`zsh` keeps working.

The shell is always zsh, named outright rather than taken from the environment, so the tab is a zsh
tab whatever the user's login shell happens to be. It is a fully interactive zsh reading its own
startup files, then sets its prompt to `> ` so user prompt formatting does not change the shell tab's
terminal display. The pre-command and post-command hooks are installed by zsh's own startup rather
than typed at its prompt: the application starts zsh with a startup directory of its own whose files
run the user's `.zshenv` and `.zshrc` from wherever they normally live, then set the prompt and
install the hooks after them. The user's own `ZDOTDIR`, when they have one, is restored before their
files run and stays in place afterwards, so programs the shell starts see it unchanged, and a
history file the system's startup would have pointed into the application's directory is pointed
back at the user's. If the user's `.zshenv` turns off the remaining startup files, the hooks are
installed there instead. The startup directory is private to the user, is created with the first
shell tab, and is removed when the application exits. Whatever the startup files print, including a
warning from zsh about its history file, is cleared just before the first prompt appears.

The prompt and the command line typed at it are bold, and command output is not, so each command
stands apart from what it printed. That holds for a line typed in the terminal, a line the command bar
sends to zsh, and the echoed line above an application command's reply, along with the prompt shown
after that reply. A command keeps its bold in the scrollback after it runs.

The hooks are installed once per shell, by the shell itself, before any browser attaches. Opening,
docking, undocking, or reloading the browser mounts the tab, and every mount only attaches: it types
nothing into the terminal, does not hide it, and clears it only on the shell's one setup-complete
marker, so a `vim`, `python`, `ssh` or `sudo` prompt in the foreground is left alone. A re-attached
terminal starts with an empty screen and shows the shell's output from that point on.

## Lifetime

Each shell keeps its workspace alive until it closes. Closing the source tab does not remove a clone still used by a shell. The clone is removed after its final owning tab closes.

A line submitted in a provisioning shell's command bar joins the shell's command queue, with the bar reading `queue >`, and the queue drains once zsh reaches its first prompt, as a line queues behind a busy zsh. When the clone lands and zsh starts, the notifications feed shows `Shell "<name>" ready. (workspace: <clone dir>)`, followed by the sandbox notice when Seatbelt confinement is not actually active. If the clone fails, the feed shows `Failed to create workspace for "<name>": <reason>`, attributed to the tab `zsh` was typed in, and the shell tab closes itself a few seconds later, taking any queued lines with it. Closing a provisioning shell cancels its clone, and no ready line follows. These lines arrive after `zsh` has returned, so they always go to the notifications feed, whichever tab issued `zsh`, and are dropped while no feed is open, like every feed line. A shell opened without a workspace reports nothing.

Completion and the metadata row's file-navigator and new-shell actions use the shell tab's recorded directory even when another tab is selected. That recorded directory follows zsh's current directory, so after a `cd` the **new shell here** button and `Cmd+T` start the new shell where this one now is, and **open file navigator here** opens the navigator on that same directory. When zsh has moved outside the project root, and outside its workspace clone when it has one, the new shell starts in the workspace clone or the project root instead, because a terminal may only start inside the project. A new shell's recorded directory is the one its terminal actually started in, fallback included, from the moment the tab opens (`openPluginTab` in `src/tab/openers.ts` takes it from the spawned terminal, not from the source tab), so completion, the metadata row and anything opened from it agree with the shell even before zsh first reports its directory, which a shell no browser has mounted never does. A new shell from **new shell here** or `Cmd+T` inherits the shell's workspace and offline mode. A new agent shares the shell's workspace and offline mode too.

When docked, bare `close` and `Cmd+W` act on the shell tab whose command bar has focus. An `agent` command uses that shell tab as its source for the new agent's working directory and group.

One tab per `zsh`, always. `zsh` twice opens two tabs even in the same directory, because a shell is
stateful and refocusing the first would take its foreground program and its directory away from the
second.

**The tab closes when the shell exits** — `exit` typed in the terminal, or a shell whose input ends.
There is no exited state and no way to start a fresh shell in the same tab, so a closed tab is the
honest representation of a shell that is no longer running. Closing the tab closes the shell the same
way. A shell that exits while no browser is attached does not leave a tab behind waiting for input
that can never arrive: the tab asks on its next appearance whether the process is still there, and
closes if it is not.

## Session recording

Every shell tab's session is recorded automatically, with no command, flag, or setting to turn it on
or off, from the moment zsh starts to the moment it exits. The launch shell — `janus`, the tab every
launch opens first — records on the same terms as any other shell tab. A project that sets
`"recordShellTabs": false` in `.janissary/config.json` records no shell tab at all: no file is written
and the tab draws no recording flag. Nothing else changes — the shell, its terminal and every other
tab are unaffected, and a named-harness or ssh tab is still recorded (see [[harness-recording]]).

The recording is a playable asciicast file under `.janissary/recordings/`, named after the tab's label
and the time it started, and governed by the same rules as a harness or ssh recording: it is created
lazily on the first output, captures output and resizes only, is cleared at a fresh launch and
preserved across `--relaunch`, and can be played back with `play <label>` or opened by pressing the
tab's recording flag. See [[harness-recording]].

**What is written is what the terminal printed, and — because zsh echoes it — what was typed.** No
input is recorded deliberately: no keystroke event is written, and nothing is read from what you type.
But a shell echoes each character back to the terminal as it is entered, and that echo is part of the
same output stream, so a password typed at a `sudo` or `psql` prompt reaches the recording. This is a
real difference from a harness or ssh tab, where nothing you type is echoed. The mitigations are the
ones every recording here has: the file is written under the project's own `.janissary/recordings/`,
never served over the network or handed to a browser client, and cleared at the next fresh launch.

If the recording cannot be written — an unwritable directory, say — the shell is unaffected, recording
simply stops, and a single `shell recording failed` line appears in the notifications feed for that
tab. The flag stays and still opens whatever was written.

## Everything else

The tab is an ordinary plugin tab in the rest: live and in-memory, never persisted and never restored
by `--relaunch`, dockable into either sidebar, and splittable. Selecting text with the pointer and
right-clicking offers the same **Copy** every other terminal surface offers.

Its terminal connection belongs only to that shell tab. A plugin tab cannot attach to, type into, or
resize a terminal owned by another tab.

Dragging rows from the file navigator onto the shell tab's command bar highlights the bar and, on
release, inserts their names at its caret exactly as the agent tab's bar does (see
[[file-navigator-tab]]). Nothing is sent to zsh until the line is submitted.

A paste into the command bar remains one editable command, subject to the same `!` and
command-resolution rules as anything typed. When a multi-line command is routed to zsh, the tab sends
it as one bracketed paste followed by one submit key, so its embedded newlines do not execute the
lines separately.

A line the tab sends to zsh carries text only. Escape sequences, carriage returns, and every other C0
control except newline and tab are removed first, along with DEL and the C1 controls, so a pasted
line, a clipboard-history entry, a line from `send` or `queue`, or a dropped file name cannot end the
bracketed paste early or submit part of the line. The same removal applies to an application reply
and its echoed command line before either reaches the terminal, so a reply cannot make the terminal
answer a query into zsh or change its state. Control keys pressed in the command bar (`Ctrl+C`,
`Ctrl+D`, `Ctrl+Z`) are unaffected.

See also [[tab-plugins]], [[shell]], [[agents]], and [[tabs]].
