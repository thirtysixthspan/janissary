# Shell Tab

A **shell tab** is a tab whose body is a live pseudo terminal running zsh: the metadata row on top, the terminal where the transcript would be, and the command line
beneath it. Type `shell` in any tab's command bar to open one; by default it gets a sandboxed workspace clone
of its own (see "Where the shell starts"). `shell <name>` names the tab. `shell … in group <name|id>` selects a group by its case-insensitive name or positive numeric ID, creating a group when the selector is not present. Without a group clause, the shell joins the issuing tab's group. Without a name, each
shell tab is named from the agent-name pool — a name no open tab already holds, and no harness or remote shell
session that is provisioning, active, reconnecting, or detached still holds (see "Name clashes" in [[harness]])
— and the tab strip shows that name, so two shells read as two distinct tabs and either can be
addressed by name. A shell therefore never takes the name of a detached remote shell that could come
back under it. Once every name in the pool is held, a new shell tab is named `shell`, then `shell-2`,
and so on.

Every launch opens one shell tab of its own, before any other tab exists: the **launch shell**,
labelled `janus` rather than given a pool name, started in the project directory with no workspace,
in the first palette colour and the `launch` group (ID 1; see [[tabs]]). It is an ordinary shell tab in every other
respect — `exit` closes it, and as the last tab that quits the app — and the application opens it
through the same plugin as `shell`, from no tab at all.

After `janus` opens, the application attempts a second shell through the same plugin, with label
`system`, in the project directory and without a workspace. It is marked as the managed system shell
and hidden immediately, leaving `janus` visible and focused. It is a normal zsh shell tab when
revealed with `tab focus system`; closing it hides it again. A failure to open this shell posts
`System shell could not start: <reason>.` in Notifications and does not prevent startup or remote
session restoration. If the command creates the tab before returning a failure, that attempt's tab
and local terminal are closed while its original reason is reported; a pre-existing tab named
`system` is left untouched. The failed attempt leaves no placeholder tab. A later ensure attempt may
retry; a dead already-managed system shell is left in place for the later lifecycle that owns
replacement.

The launch shell is the visible tab when the window first appears, and its command bar holds the
keyboard focus, not its terminal. The first thing typed after launch goes to the `janus` command bar
without a click. A window that opens without operating-system focus keeps the command bar as its
focused element, so the keyboard lands there as soon as the window is activated.

The tab is contributed by a **bundled tab plugin** rather than by the application core (see
[[tab-plugins]]). Nothing about it changes because of that: `shell` is in every build, and what
follows describes the behavior.

## Choose where keys go

The shell tab has two keyboard surfaces: the command bar and the terminal. The command bar is focused
when the tab opens. Double-click the terminal or press `Shift+Tab` from the command bar to type directly into
zsh; double-clicking clears any terminal selection made by the gesture. A single click on the terminal
returns focus to the command bar. A single click never gives the terminal the keyboard, not even while
the button is held, so its focus line, prompt and cursor do not change. Press `Shift+Tab` again to return
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
warns about none of this; `!` is the override, and it is documented in `help keys`. The bare `clear`
command is sent directly to zsh so it clears the terminal, while `/clear` still clears the app transcript.

The shell launcher is also an application command in this bar: `shell <name> -w` opens a sibling shell
with that name and a fresh workspace. To run a zsh command whose text starts with `shell`, prefix it
with `!`.

First refusal means what it says. A line the application answers itself — a bare word that opens a
picker, `quit` or `/quit`, or `close` or `/close` that would take the last tab with it — is answered
here rather than sent onward. A quit typed in a shell tab asks the same confirmation it asks anywhere
else (see [[quit-confirmation]]), and a bare word opens the same picker.

`nav`, or `nav <query>`, submitted from the shell command bar opens the fuzzy tab navigator over the
shell tab, pre-filled with the query; submitting `nav`
while the navigator is open closes it. Neither reaches zsh. The shell draws its overlays from the
same overlay stack as any plugin tab, so one navigator appears over it, whether `nav` or `Ctrl+G`
opened it.

The bare `theme` picker appears over the shell tab. While it is open, the application's arrow,
Return, and Escape handling controls the selection, applies the chosen theme, or dismisses the picker.
If the shell tab is docked in a sidebar, the picker appears over that shell there; its keys stay with
the picker and are not sent to zsh. The terminal content is painted in the application theme's own
colors — its background, text, cursor, and selection match the rest of the tab, so a light theme
gives a light terminal — and they change with the theme, including when the picker applies a
different one. The padding between the focus line and the terminal text takes the same theme
background, so no dark strip shows beside the text under a light theme. Harness terminals keep their shared dark terminal colors.

The shell opts into the core [[command-queue]]. Its bar queues while zsh is busy or provisioning; zsh's prompt signals wake the core FIFO service. The core spec owns submission ordering, cross-tab queue delivery, the `queue >` indicator, and popup editing. Shell supplies ordinary command-bar routing and records queued submissions in its own history. The hidden retained system shell drains while inactive, but waits until its terminal is attached before dequeuing shell-directed work. Structured queue receipts preserve server-owned schedule provenance through application dispatch; shell-first commands and application-intercepted commands discard an unused receipt, while dispatch rejection and consumer cleanup also release it. Direct terminal input bypasses the queue.

An application command that answers with text rather than opening something — `help`, for one — is
shown in the terminal as a command line, followed by its reply on the next line. The reply is markdown, as
it is in the ACP response panel, and is rendered for the terminal rather than shown as raw markup:
headings and bold text are bold, the top heading underlined, italic and struck-through text keep
their styles, inline and fenced code is colored and code blocks are indented, list items get bullets
or numbers, quotes get a bar, links show their target after the text, and tables are lined up in
columns under a bold header. Neither line is sent
to zsh. Commands that open a picker keep their existing behavior.

A slow application command never disables the shell. Its runtime is not charged to the shell plugin's
handler deadline (see [[tab-plugins]]), so a command that takes longer than five seconds — another
plugin's command, a large `open`, a shell launch — leaves every shell tab and its zsh process open.
The reply waits for the command for at most 30 seconds. A command still running then shows the output
it had produced so far, and keeps running.

When the terminal is in its normal buffer and can measure the reply, it is rendered as HTML — the same
markdown rendering the ACP response panel uses, in the terminal's theme colors — in a block placed
in the terminal's scrollback directly under the echoed command and followed by zsh's prompt. Its
rendered content fits the block without an internal scrollbar, and the reply scrolls with the
terminal without adding an application-window scrollbar. The decoration stays inside the terminal
body and never covers the metadata row or tab strip. Its visible portion stays rendered while
scrolling through it, even when its first row is above the viewport. The block is not terminal text,
so terminal search does not see it, and a terminal selection never covers it. Text in a rendered
reply is selected by dragging over it with the pointer: the press goes to the reply rather than the
terminal, so it starts an ordinary text selection, and a drag that leaves the reply selects only up
to the reply's edge. When the drag ends, the keyboard returns to the command bar, as after any
click on the terminal, and the selected text stays highlighted in the terminal's selection color.
The copy chord (see § Keys) and the right-click menu's **Copy** copy it through the shared
clipboard, exactly as they copy a terminal selection. A reply selection and a terminal selection
never stand together: pressing the primary button anywhere in the terminal, a reply included,
clears whichever is held, and a double-click or a resize of the terminal clears it too. A
right-click keeps it. When a full-screen program holds the terminal, or the reply cannot be
measured or placed, it falls back to the styled terminal text described above.

A link in a reply rendered as HTML opens the way the same link opens from the ACP response panel: a
web address opens through `open`, and a `path:line` reference opens in an editor tab. A click on any
link in the block never navigates the application window, so a link the application does not open
does nothing.

**Tab completion is the application's.** `Tab` in the command line asks the application's own
completion, and shows the same strip when there is a choice to make. The shell tab keeps no list
of its own. One match completes the line, several matches show the choice strip with two spaces
between choices, and no matches leave
the line unchanged. When several choices are visible, `Escape` closes the strip and leaves the
command line unchanged. Otherwise, `Escape` with text in the focused command line clears that text
without submitting it. With an empty command line, `Escape` returns the terminal to the bottom of
its scrollback.

`Ctrl+A` and `tasks` open the shared task picker over the shell tab. Choosing a task inserts its
`execute …` command at the shell command bar's caret and leaves it there for you to edit or submit.
The shared pickers and the queue popup treat the shell this way because its declaration carries
`hostsCommandBar` and requests both core queue capabilities, not because the application knows the shell plugin by name (see [[tab-plugins]]).

A picker opened from a shell's bar belongs to that shell, including a shell docked in a sidebar while
another tab is current. It appears over the shell, a task picked from `tasks` lands in the shell's
own bar rather than the focused tab's, and choosing a profile replaces the shell's draft with
`profile launch <name>` without submitting it. `queue` lists, edits and deletes the shell's own queued
lines. If the shell closes while a task or queue picker is open, that picker moves to the current
tab; profile selection does not redirect into another tab. The queue popup closes if that tab has no
queue edit surface.

A shell that is not on screen opens no picker. That covers a shell hidden behind another centre tab
and a docked shell behind another entry in its sidebar. A picker word reaching it, such as a queued
`tasks`, `queue`, `theme` or `nav` line draining in the background, is recorded in the bar's history
and the queue moves on to its next line. Nothing appears, so no unseen picker takes the arrow, Return
and Escape keys from the tab in front.

The command bar's status dot uses the same color as the shell tab's dot.

## Keys

`Cmd+T` opens another zsh tab beside this shell, exactly as the metadata row's **new shell here** button does. The new shell starts in the same working directory. Beside an unsandboxed shell it is unsandboxed; beside a sandboxed one it runs inside the same workspace clone with the same offline setting. A remote shell's sibling joins its existing remote channel and workspace, starts at its current directory when that directory is inside the workspace (otherwise at the workspace root), and inherits its offline setting. It never creates a workspace, which is what sets it apart from a typed `shell`. While the source workspace is provisioning, `Cmd+T` does nothing. In other tabs, `Cmd+T` keeps opening a new shell tab.

`Cmd+T` works the same with the terminal focused as with the command bar focused, and when the keyboard rests on the page with the shell as the current tab. It is a chord the shell plugin's declaration claims beside `Ctrl+R`, so like `Ctrl+R` it belongs to the shell only while the shell is the visible tab, or the selected entry in the sidebar it is docked to. `Cmd+T` pressed in another tab's command bar beside a docked shell still opens a new shell tab.

`Ctrl+C`, `Ctrl+D` and `Ctrl+Z` in the command line send interrupt, end-of-input and suspend to the
shell — the characters a terminal would send. The terminal also accepts direct input when focused.
`Ctrl+C` copies the command line's own selection instead when it holds one, so copying by keyboard
still works.

`Ctrl+Shift+C` copies the terminal's selection; on macOS, `Cmd+C` does the same. The chord works
whether the keyboard is in the terminal or in the command bar. Dragging over output with the pointer
selects it and leaves the keyboard in the command bar, as any single click on the terminal does, so
the chord copies that selection from there. When the command line holds a selection of its own, the
chord is left to the command line, so `Cmd+C` copies the command line's text as in any text field.
With nothing selected in either, the chord does nothing. Text selected in a rendered Markdown reply
is copied the same way, from the terminal or the command bar. Both chords use the shared clipboard
writer, so the text is available from the system clipboard and the clipboard-history popup.

A program running in the shell can copy too, by sending the terminal an OSC 52 request, which is how a
program on a remote or SSH host reaches the clipboard of the machine the tab is shown on. The text goes
through the same shared clipboard writer, exactly as it does in a harness tab. A request to read the
clipboard back is answered with nothing.

`Shift+↑`/`Shift+↓` and `Ctrl+↑`/`Ctrl+↓` scroll the terminal with acceleration. `Page Up` and
`Page Down` move by half a terminal screen. `Escape` returns to the bottom of the scrollback when
the command line is empty or the terminal has focus; with text in the focused command line, it clears
the text instead.

`Up` and `Down` walk the tab's command history. It holds the lines the command bar has sent or the application has handled, and every command
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
it or it went to zsh, a `!` line included — enters that global history too, attributed to this tab.
Commands typed directly into the terminal, and lines
another tab delivers with `send` or `queue`, do not.

Every other chord belongs to the application, unchanged: `Ctrl+A` opens the task picker, `Ctrl+G` the
tab navigator, `Cmd+P` quick open and `Cmd+Shift+F` the project search, all with the cursor in the
command bar. `Ctrl+E` opens the queue popup over the shell tab, as
described above. `Cmd+F` does nothing here — the terminal is not a searchable in-tab transcript — which
is the same in every plugin tab. The session's text transcript, once opened with **Open transcript**
(see § Text transcript), is searched with `Cmd+F` in its editor tab.

`Ctrl+R` opens this tab's own history while it is the visible one, and a bare `hist` submitted from the
command bar opens the same list rather than the application's history picker, which a shell tab's
command line never adds to. `hist` itself is not added to the list. It lists the tab's command
history — the lines its command bar has sent and the commands typed into its terminal — oldest first
with the newest line selected at the bottom. It uses the same presentation and
keyboard navigation as the application's history picker — a multi-line command shows as its first line
with a `(N lines)` postfix, and is put back whole — but Return puts the selected line back in the
command bar without running it. Focus any other tab and `Ctrl+R` opens the application's history picker
again. That holds for a docked shell too: while it shows in a sidebar, `Ctrl+R` pressed in another
tab's command bar opens the application's picker, however many shells are docked. A shell that is the
current tab keeps the chord when the keyboard rests on the page itself, such as after a click on its
metadata row.

The list is driven by the keyboard without ever taking it from the command bar: `↑`/`↓` move the
selection, `Return` puts the chosen line back in the bar, and `Escape` closes it. Picking a row with
the mouse does the same, and either way the bar is where the keyboard is afterwards, so a recalled line
can be edited or run.

## The metadata row

The row shows the shell's current working directory, shortened to `$root`, `$workspace/<name>`, or
`$git-sync` when it is inside the project, the workspace clone, or the shared git-sync clone. The stored directory stays absolute for shell actions.
It shows a workspace mark when that directory is a workspace clone, and the actions a shell tab can
act on: **open file navigator here**, **new shell here**, the split control, and the connections and
schedule windows.

While a shell's workspace clone is still provisioning, the row shows the spinning sync icon titled
`Provisioning workspace` in the workspace mark's place, as a harness tab does, and the terminal area
stays empty. The **new shell here** button is disabled and dimmed, with the tooltip `Waiting for the
workspace`. **Open file navigator here** stays available and opens on the clone. Once zsh starts, the
flag gives way to the workspace mark and the button comes back.

It also carries the **recording** flag — a film icon, drawn before the workspace mark — which reports
that this shell's session is being recorded and opens the recording when pressed. It is drawn plain
and inert until the shell has printed something, green and pressable from that moment on, and stays
green and pressable once the recording has stopped, so a partial recording is still reachable. See
[[harness-recording]] § The recording flag.

It also draws an **Open transcript** button — the clipboard icon, with the tooltip and accessible name
`Open transcript` — once the shell's text transcript file has opened, which in practice is as the
shell starts. It sits among the row's actions after the **Show diff in the workspace** button (drawn
only on a workspaced shell) and before the connections window button. Pressing it opens the file as it
stands in an editor tab named after the file, `<label>-<timestamp>.txt`. Once drawn it stays after the transcript has
failed and opens whatever was written. A docked shell's button works the same way. Under
`"recordShellTabs": false` it is never drawn. See § Text transcript.

A remote shell also shows the remote host as ordinary text matching the working-directory text, with
the full destination in its tooltip. Its connection status plug sits in the flag group beside the
recording and workspace marks. It shows provisioning until the remote workspace is ready, connected
while the SSH session is live, and reconnecting while it is recovering. The shell has the same
attach/detach control as a remote harness. It offers **Detach** for a live session and **Attach**
while reconnecting; detaching asks for
confirmation because it closes every tab sharing that remote session. Local shell metadata is unchanged.

The **new shell here** action on a remote shell, and the ➕ action on a remote harness, open a
sibling shell on that tab's existing remote workspace and channel. Its working directory follows
the source tab when it is inside the workspace, and otherwise falls back to the workspace root. The
action is disabled while the workspace provisions. A remote harness offers the same **new shell here** action.

The connections window includes the tab's own `zsh` terminal as soon as the shell tab opens. The
connections and schedule windows auto-show for five seconds whenever the tab becomes visible, then
fade over 300 ms unless pinned or hovered. If an empty window gains its first row after that interval,
it auto-shows again; a window with no rows stays hidden.
Both popups begin below the metadata row, which remains visible.

A shell tab can hold scheduled commands (see [[scheduling]]): `schedule` from its own command bar, or
`schedule … in <shell tab>` from another tab, attaches the entry to it, and the "New schedule" dialog
offers it as a target. Its entries appear in the schedule window. When one falls due, the command is
typed into zsh as a line, exactly as if entered at the terminal. The schedule lives as long as the tab.

`send`, `queue`, and `schedule` all accept a plugin tab that owns a live terminal (`ownsTerminal`
in `src/tab/plugin-terminals.ts`). `send` and `queue` additionally accept one whose workspace clone
is still provisioning (`awaitsTerminal` beside it): the line joins that shell's command queue with
the usual confirmation (`→ <shell>: <text>` or `→ <shell> (queued): <command>`) and runs once zsh
starts. `schedule` deliberately does not, so `schedule … in <shell>` is refused until zsh has
started, because a schedule types into a terminal that must already exist. A plugin tab without a terminal answers `send` with
`Tab "<label>" does not accept input.`, answers `queue` with `Tab "<label>" has no command queue.`,
refuses `schedule … in <label>` with `Tab "<label>" cannot run scheduled commands.`, and is not
offered as a target in the "New schedule" dialog.

The terminal takes the place of an in-tab transcript; the session's text is kept in a file opened with
**Open transcript** (see § Text transcript). The working directory shown follows the shell's current directory. It updates after a `cd` and when zsh
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

The command is `shell [name] [-w|--workspace|--no-workspace] [--offline] [on <address>]`, read the way `harness` reads
its own. A typed `shell` creates a new sandbox by default, wherever it is typed, a sandboxed tab included:
a fresh `git clone` of the project's `origin` under `.janissary/workspace/<name>/`, with zsh confined to
it by the same Seatbelt profile and credential injection a `harness -w` gets (see [[workspaced-agent]]).
The clone is shallow, on a remote host as on this machine: it holds only the newest commit of each branch.
`-w` and `--workspace` confirm the default. `--no-workspace` opts out and wins when both are given.
`--offline` provisions the clone with the offline sandbox profile, which denies network access, and
changes nothing without a workspace. `on <address>` opens the shell on that remote host and implies
a workspace even when `--no-workspace` is present. Flags and `on` match case-insensitively; the
`on <address>` clause may appear anywhere among the name and flags, and the address keeps its case
and follows [[remote-server]]'s address grammar.

The words after `shell` that are not flags form the name, lowercased, as `harness <name>`'s do. The name is
the tab's label and, for a workspaced shell, the clone's folder. A typed name is held to the shared
launch-name rules: one that clashes with an open tab or a live session is refused, a workspaced name must
be a single folder name, and a leftover folder under it is removed before cloning, with the
notifications-feed messages for each. Without a name the shell is named as described above.

An address after `on` is checked before any connection opens. A missing or invalid address reports
the address usage or validation error. A word starting with `-` that is not one of the four flags is
refused with `Unknown option "<word>". Usage: shell [name] [-w|--workspace|--no-workspace] [--offline]
[on <address>]` and nothing opens; such a word never becomes part of the name.

A workspaced shell's tab opens at once, while the clone runs, and zsh starts confined to the clone, at
its root, when the clone finishes. With no git repository, or no readable `origin` remote, a typed `shell`
still opens a shell, unsandboxed exactly as `--no-workspace` would, and answers `Shell "<name>" has no
workspace: <reason>.`, where the reason is `no git repository found` or `the repository has no "origin"
remote`.

An unsandboxed shell — `shell --no-workspace`, or that fallback — never starts inside another tab's clone.
It starts in the issuing tab's working directory when that tab is
local, has no workspace, and is inside the project checkout, and at the checkout root otherwise. The
**new shell here** button and `Cmd+T` are the way to open another shell inside an existing clone.

A local shell's starting directory must be inside the project root, and a local shell cannot be
started anywhere else: a terminal only ever runs in a directory inside that root. A remote tab's
typed `shell` without `on` opens a sibling in that tab's remote workspace and channel. It inherits the
workspace offline setting; `-w`, `--workspace`, `--no-workspace`, and `--offline` do not change the
remote workspace. A name is still honored and checked against the normal tab and session clashes.
While the workspace provisions, it reports `The remote workspace is not ready yet.`; if the remote
session is reconnecting or gone, it reports `The remote workspace is no longer available.`. A remote
tab cannot start another standalone remote shell: `shell … on <address>` answers
`Cannot launch a remote shell from a remote tab.` and opens no tab.

`shell <name> on <address>` opens its tab immediately with the live SSH terminal attached. Password,
passphrase, host-key, and other SSH prompts appear in that terminal and are answered by typing there.
When the remote workspace is ready, the same tab switches to zsh at the workspace root. The shell
has its own SSH channel and workspace; the remote host's isolation notice follows its ready line.
There is no local fallback if the remote launch fails.

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

A line submitted in a provisioning shell's command bar joins the shell's command queue, with the bar reading `queue >`, and the queue drains once zsh reaches its first prompt, as a line queues behind a busy zsh. This also holds for a remote shell: `send` and `queue` are accepted while SSH prompts render, and queued lines drain after remote zsh reaches its prompt. When a local clone lands and zsh starts, the notifications feed shows `Shell "<name>" ready. ($workspace/<name>)`; a remote shell reports `Shell "<name>" ready on <host>. ($workspace/<name>)` — the same form for both, since a remote clone is a path the local root abbreviation could never shorten (see [[root-path]]). The remote isolation notice follows the remote ready line when present. If a local clone fails, the feed shows `Failed to create workspace for "<name>": <reason>`; a remote failure shows `Failed to start "<name>" on <host>: <reason>`. In either case the shell tab closes itself a few seconds later, taking any queued lines with it. If remote zsh exits before its first prompt while a browser is attached, the feed shows `Failed to start "<name>" on <host>: zsh exited before its first prompt.` before the tab closes. If no browser is attached at that moment, the next attachment discovers the exited terminal and closes the tab without that line. Closing a provisioning shell closes its remote channel, and no ready line follows. The delayed close, failure line and ready line belong to the shell that launch opened: a shell closed and then retyped under the same name is never closed, reported as failed or announced as ready by the earlier launch. These lines arrive after `zsh` has returned, so they always go to the notifications feed, whichever tab issued `zsh`, and are dropped while no feed is open, like every feed line. A shell opened without a workspace reports nothing.

Completion and the metadata row's file-navigator and new-shell actions use the shell tab's recorded directory even when another tab is selected. That recorded directory follows zsh's current directory, so after a `cd` the **new shell here** button and `Cmd+T` start the new shell where this one now is, and **open file navigator here** opens the navigator on that same directory. When zsh has moved outside the project root, and outside its workspace clone when it has one, the new shell starts in the workspace clone or the project root instead, because a terminal may only start inside the project. A new shell's recorded directory is the one its terminal actually started in, fallback included, from the moment the tab opens (`openPluginTab` in `src/tab/openers.ts` takes it from the spawned terminal, not from the source tab), so completion, the metadata row and anything opened from it agree with the shell even before zsh first reports its directory, which a shell no browser has mounted never does. A new shell from **new shell here** or `Cmd+T` inherits the shell's workspace and offline mode.

When docked, bare `close` and `Cmd+W` act on the shell tab whose command bar has focus. A `shell` command uses that shell tab as its source for the new shell's working directory and group.

One tab per `shell` command, always. `shell` twice opens two tabs even in the same directory, because a shell is
stateful and refocusing the first would take its foreground program and its directory away from the
second.

When an ordinary shell exits, its tab closes; there is no exited state or way to start a fresh shell in
that tab. A shell that exits while no browser is attached is checked on its next appearance and closes
if its process has ended. The terminal callback and mount-time status request carry the PTY id captured
by that attachment. A status reply is actionable only when its echoed id matches and `running` is false,
so a delayed callback or reply cannot close a replacement generation. A verified exit closes directly,
including for the last ordinary shell, without quit or unsaved-close confirmation. Closing one ordinary
shell leaves every other shell tab visible and usable. The server's `pty:exit` event remains the owner of
managed system-shell recovery; a client report calls the same idempotent `SystemShellManager.handlePtyExit`
and does not start another recovery path.

The managed `system` shell has a different process-exit lifecycle. When the server observes its PTY
exit, it sends the original exit event to the client, hides the same tab, removes that tab's schedules,
and asks the shell plugin to replace its exited PTY with a fresh project-root shell. Its label, alias,
placement, focus, and queued commands stay with the tab; the old recording and text transcript finish
through their PTY-exit listeners. The replacement uses a fresh marker nonce. If replacement fails, the
tab stays hidden with its identity and queue intact and does not retry on its own. A later explicit
ensure may retry while the shell plugin remains enabled. This process-exit recovery is separate from
user close: closing the managed tab only hides it and does not restart its shell.

## Session recording

Every shell tab's session is recorded automatically, with no command, flag, or setting to turn it on
or off, from the moment zsh starts to the moment it exits. The launch shell — `janus`, the tab every
launch opens first — records on the same terms as any other shell tab. A project that sets
`"recordShellTabs": false` in `.janissary/config.json` records no shell tab at all: no file is written
and the tab draws no recording flag. Nothing else changes — the shell, its terminal and every other
tab are unaffected, and a named-harness or ssh tab is still recorded (see [[harness-recording]]).

The recording is a playable asciicast file under `.janissary/recordings/`, named after the tab's label
and the time it started, and governed by the same rules as a harness or ssh recording: it is created
lazily on the first output, captures output and resizes only, is cleared at every launch, and can be played back with `play <label>` or opened by pressing the
tab's recording flag. See [[harness-recording]].

**What is written is what the terminal printed, and — because zsh echoes it — what was typed.** No
input is recorded deliberately: no keystroke event is written, and nothing is read from what you type.
But a shell echoes each character back to the terminal as it is entered, and that echo is part of the
same output stream, so a command line typed at the prompt, or text an interactive program echoes, reaches
the recording — a secret typed as `export TOKEN=…` included. A password typed at a prompt that turns
echo off (`sudo`, `ssh`, `psql`) prints nothing, so nothing of it is recorded. This is a
real difference from a harness or ssh tab, where nothing you type is echoed. The mitigations are the
ones every recording here has: the file is written under the project's own `.janissary/recordings/`,
never served over the network or handed to a browser client, and cleared at the next fresh launch.

If the recording cannot be written — an unwritable directory, say — the shell is unaffected, recording
simply stops, and a single `shell recording failed` line appears in the notifications feed for that
tab. The flag stays and still opens whatever was written.

## Text transcript

Beside its recording, every shell tab keeps a plain-text transcript of its session: the rows the
terminal displayed, as text, in a file under `.janissary/shell-transcripts/`. It is a separate file
from the recording above and from the harness session transcript under `.janissary/harness-transcripts/`
(see [[harness-recording]]); either the recording or the text transcript can fail without stopping the
other. It is opened from the metadata row's **Open transcript** button (see § The metadata row).

**Which shells keep one.** Exactly the shells that are recorded: the launch `janus` shell, every
`shell` tab, remote shells and their siblings. A PTY started with `!` from another tab keeps none, as it
has no recording (see [[harness-recording]] § What is **not** recorded). A project that sets
`"recordShellTabs": false` turns off the text transcript along with the recording.

**The file.** It is named `<label>-<timestamp>.txt`: the tab's label, sanitized for a filename, and the
ISO time it started with `:` and `.` replaced by `-`. A tab's `.txt` and its `.cast` recording are named
alike, but their timestamps are taken separately and may differ by a few milliseconds. The file is
created lazily, on the shell's first output; zsh's first prompt provides that at once, and a shell that
finished before printing anything leaves no file. It is cleared at every launch.

**What it holds.** Every normal-screen row as displayed: prompts, the command lines typed, their output,
background-job output and startup-file output, as plain text with no escape sequence or colour, and
with no separators, timestamps or annotations added. Nothing is written while a full-screen program
such as `vim`, `less` or `top` holds the alternate screen; the normal-screen output before and after it
is. An application command's reply, such as `help`'s, and its echoed command line are drawn by the
browser and never pass through the shell, so they never reach the file.

**When a row is written.** A row is written once, the first time the cursor moves below it, at the
width the terminal had then, and is never revisited: a later redraw keeps its first form, and `clear`
removes nothing already written. A row redrawn by carriage returns before the cursor leaves it, such
as a progress line, is written once in its final form. Three imperfections are accepted. After a
program erases the screen below rows already written — zsh does this when it clears a completion
list — the row above the cursor can be written a second time in its current form. Rows that
auto-wrapped between such an erase and the next line feed keep only their last row. And a single
unbroken line longer than 1000 terminal rows keeps only the row it ends on.

**Input exposure.** Input is kept as the terminal echoed it, on the same terms as the recording (see
§ Session recording): a secret on a command line (`export TOKEN=…`) or echoed by an interactive program
(a python REPL, `read`) lands in the file, while a password typed at a prompt that turns echo off
(`sudo`, `ssh`, `psql`) prints nothing, so nothing of it reaches the file. The mitigations are the
recording's: the file is under the project's own `.janissary/`, never served over the network or
handed to a client except when the user presses **Open transcript**, and cleared at the next fresh
launch. `"recordShellTabs": false` is the opt-out.

**End of session.** When the tab closes or zsh exits, the cursor's unfinished row — a waiting prompt, a
progress bar — is written as it stands, then the file closes. The transcript remains protected from
save, rename, or move during this short draining period, until its final writes have settled. At
application shutdown the app waits up to one second for every open or closing transcript to write its
final row and close.

**Saving from the editor.** **Open transcript** shows the file in an ordinary editor tab, but while its
shell is still running a save of that tab is refused, whether or not new rows have arrived since it
opened and including the overwrite prompt's save: the file is left exactly as written, the editor
reports the save as failed, and the notifications feed shows `This shell transcript is still being
written; copy it to another file to edit it.` for the editor tab. Replacing the file would cut every
later row of the session off from it. Renaming the transcript's editor tab, or renaming the file or
dragging it on its own to another folder in a file navigator, is refused the same way while the shell runs, because the button and the
save refusal would go on naming the old path: the file stays where it is and the notifications feed
shows the rename or move as failed with `A running shell is still writing this transcript; rename or
move it after the shell exits.` Deleting it from a file navigator is not refused. Once the final writes
have settled after the shell exits or its tab closes, the transcript saves, renames and moves like any
other file.

**Size and failure.** The file has no size cap. The transcript stops for the rest of the session, after
the rows already finished, in three cases: its directory cannot be written (the file never opens),
more than 4 MiB is waiting to reach disk, or output arrives faster than it can be transcribed (more
than 4 Mi characters waiting to be parsed). After a failure the cursor's unfinished row is not written.
The shell and its recording are unaffected. A single `shell transcript failed` line appears in the
notifications feed for that tab (see [[notifications]]): at most one per open tab however many times
its transcript fails, nothing for a failure that surfaces only after the tab has closed, and a later
tab reusing the label is reported afresh. The **Open transcript** button stays and opens whatever was
written.

## Everything else

The tab is an ordinary plugin tab in the rest: live and in-memory, never persisted and never restored, dockable into either sidebar, and splittable. Selecting text with the pointer and
right-clicking offers the same **Copy** every other terminal surface offers, and the copy chord in
§ Keys copies the same selection.

Its terminal connection belongs only to that shell tab. A plugin tab cannot attach to, type into, or
resize a terminal owned by another tab.

Dragging rows from the file navigator onto the shell tab's command bar highlights the bar and, on
release, inserts their names at its caret exactly as any application command bar does (see
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

## Core ACP connections

The shell requests the core ACP start, prompt, and reset capabilities. `acp <prompt>` streams Markdown and tool steps in the core response panel above the bar, rather than duplicating them in zsh. The panel's Reset ACP control works while the bar is awaiting a response. It and the tool-step controls target this shell even when docked. A selected docked shell also shows its pending core question. Protocol, model selection, session reuse, local sandboxing, remote workspaces, and tool-loop rules live in [[acp]].
