# Shell Tab

A **shell tab** is a tab whose body is a live pseudo terminal running zsh, laid out exactly like an
agent tab: the metadata row on top, the terminal where the transcript would be, and the command line
beneath it. Type `zsh` in any tab's command bar to open one; the tab is named `shell`, so a second is
`shell2`.

The tab is contributed by a **bundled tab plugin** rather than by the application core (see
[[tab-plugins]]). Nothing about it changes because of that: `zsh` is in every build, and what
follows describes the behavior.

## Choose where keys go

The shell tab has two keyboard surfaces: the command bar and the terminal. The command bar is focused
when the tab opens. Click the terminal or press `Shift+Tab` from the command bar to type directly into
zsh; press `Shift+Tab` again to return to the command bar. Keystrokes go to whichever surface has
focus.

The command bar offers application commands before sending an unrecognized line to zsh. Typing
directly in the terminal sends keys to zsh without that application routing.

The shell tab's status dot blinks while zsh is running a command and stops when zsh returns to its prompt.

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

The bare `theme` picker appears over the shell tab. While it is open, the application's arrow,
Return, and Escape handling controls the selection, applies the chosen theme, or dismisses the picker.
If the shell tab is docked in a sidebar, the picker appears over that shell there; its keys stay with
the picker and are not sent to zsh.

The `queue` command and `Ctrl+E` open the application's queue popup over the shell tab. The selected
queued line appears in the shell command bar; typing edits it, and Backspace or Delete on an empty bar
removes it. Arrow keys change the selected queue entry, Return leaves the popup open without submitting,
and Escape closes it and clears the bar.

A command that answers with text rather than opening something — `help`, for one — records that text
in this tab's transcript. A shell tab draws a terminal in place of a transcript, so nothing appears
on screen for it.

**Tab completion is the application's.** `Tab` in the command line asks the same completion the agent
tab's bar asks, and shows the same strip when there is a choice to make. The shell tab keeps no list
of its own. One match completes the line, several matches show the choice strip, and no matches leave
the line unchanged.

`Ctrl+A` and `tasks` open the shared task picker over the shell tab. Choosing a task inserts its
`execute …` command at the shell command bar's caret and leaves it there for you to edit or submit.

The command bar's status dot uses the same color as the shell tab's dot.

## Keys

`Cmd+T` opens another zsh tab from this shell. The new shell starts in the same working directory and shares its workspace confinement and offline setting. It does not create an agent workspace. In other tabs, `Cmd+T` keeps opening a new agent tab.

`Ctrl+C`, `Ctrl+D` and `Ctrl+Z` in the command line send interrupt, end-of-input and suspend to the
shell — the characters a terminal would send, and the only way to stop a runaway command now that
nothing can be typed into the terminal. `Ctrl+C` copies the command line's own selection instead when
it holds one, so copying by keyboard still works.

`Up` and `Down` walk the lines the command bar has sent, exactly as the agent tab's bar walks its
tab's command history. Commands typed directly into the terminal remain in zsh's own history. Ghost suggestions instead draw from the
global history shared across tabs and runs (see [[history]]); `→` or `End` at the end of input accepts
a suggestion.

Every other chord belongs to the application, unchanged: `Ctrl+A` opens the task picker, `Ctrl+G` the
tab navigator, `Cmd+P` quick open and `Cmd+Shift+F` the project search, all with the cursor in the
command bar, exactly as in an agent tab. `Cmd+F` and `Ctrl+E` do nothing here — a plugin tab has no
transcript to search and the queue belongs to agents — which is the same in every plugin tab.

`Ctrl+R` opens this tab's own history while it is the visible one, listing the lines its command bar
has sent, oldest first with the newest line selected at the bottom. It uses the same presentation and
keyboard navigation as the application's history picker, but Return puts the selected line back in the
command bar without running it. Focus any other tab and `Ctrl+R` opens the application's history picker
again.

The list is driven by the keyboard without ever taking it from the command bar: `↑`/`↓` move the
selection, `Return` puts the chosen line back in the bar, and `Escape` closes it. Picking a row with
the mouse does the same, and either way the bar is where the keyboard is afterwards, so a recalled line
can be edited or run.

## The metadata row

The row shows the working directory the shell started in, a workspace mark when that directory is a
workspace clone, and the actions a shell tab can act on: **open file navigator here**, **new shell
here**, the split control, and the connections and schedule windows.

The connections window includes the tab's own `zsh` terminal as soon as the shell tab opens. The
connections and schedule windows auto-show for five seconds whenever the tab becomes visible, then
fade over 300 ms unless pinned or hovered. If an empty window gains its first row after that interval,
it auto-shows again; a window with no rows stays hidden.
Both popups begin below the metadata row, which remains visible.

There is no **open transcript** control, because there is no transcript: the terminal replaced it. The
working directory shown is the one the shell started in and does not follow a `cd`, so a shell that
has moved elsewhere still shows where it was opened.

## Where the shell starts

`zsh` starts in the issuing tab's working directory. When that tab has a workspace clone, the shell inherits its workspace confinement and offline mode, including when opened from another shell tab. Otherwise it starts without workspace confinement. The starting directory must be inside the project root, and a shell cannot be started anywhere
else: a terminal only ever runs in a directory inside that root. A remote agent tab is therefore not a
place a shell tab can be opened from — its working directory belongs to the other host, and there is
nothing here to start a shell in.

The shell is always zsh, named outright rather than taken from the environment, so the tab is a zsh
tab whatever the user's login shell happens to be. It is a fully interactive zsh reading its own
startup files, which every other shell the application spawns deliberately does not do: a terminal
that ignored `.zshrc` would have no `PATH` additions, no aliases, and no prompt of the user's own.

## Lifetime

Each shell keeps its workspace alive until it closes. Closing the source tab does not remove a clone still used by a shell. The clone is removed after its final owning tab closes.

Completion and the metadata row's file-navigator and new-shell actions use the shell tab's recorded directory even when another tab is selected. A new shell inherits the shell's workspace and offline mode. A new agent shares the shell's workspace and offline mode too.

One tab per `zsh`, always. `zsh` twice opens two tabs even in the same directory, because a shell is
stateful and refocusing the first would take its foreground program and its directory away from the
second.

**The tab closes when the shell exits** — `exit` typed in the terminal, or a shell whose input ends.
There is no exited state and no way to start a fresh shell in the same tab, so a closed tab is the
honest representation of a shell that is no longer running. Closing the tab closes the shell the same
way. A shell that exits while no browser is attached does not leave a tab behind waiting for input
that can never arrive: the tab asks on its next appearance whether the process is still there, and
closes if it is not.

## Everything else

The tab is an ordinary plugin tab in the rest: live and in-memory, never persisted and never restored
by `--relaunch`, dockable into either sidebar, and splittable. Selecting text with the pointer and
right-clicking offers the same **Copy** every other terminal surface offers.

Its terminal connection belongs only to that shell tab. A plugin tab cannot attach to, type into, or
resize a terminal owned by another tab.

A paste into the command bar becomes one editable line, subject to the same `!` and command-resolution
rules as anything typed, so a multi-line paste is not run a line at a time and nothing is sent to zsh
before it has been seen.

See also [[tab-plugins]], [[shell]], [[agents]], and [[tabs]].
