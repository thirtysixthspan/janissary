# Shell Tab

A **shell tab** is a tab whose body is a live pseudo terminal running zsh, laid out exactly like an
agent tab: the metadata row on top, the terminal where the transcript would be, and the command line
beneath it. Type `zsh` in any tab's command bar to open one; the tab is named `shell`, so a second is
`shell2`.

The tab is contributed by a **bundled tab plugin** rather than by the application core (see
[[tab-plugins]]). Nothing about it changes because of that: `zsh` is in every build, and what
follows describes the behavior.

## One way in, one way out

The terminal is **output only**. It is never given keyboard focus, clicking it hands focus back to
the command bar, and the command bar holds focus whenever the tab is the visible one. It also refuses
input on its own terms, so a stray keystroke cannot reach zsh even if something else were to move the
focus. Nothing can be typed into the terminal directly — every keystroke goes through the command bar
beneath it, which is what makes the tab's shape the same as an agent tab's: one line you type into,
one area that shows the result.

That has two consequences a user meets immediately.

**A line means one of two things.** A leading `!` forces the shell: the rest of the line is sent to
zsh and nothing else happens. Without it, the line is offered to the application first — if it names a
command, that command runs in this tab and the shell never sees it; if it names nothing, the line
goes to zsh. So `ls` runs a shell command and `theme` opens the theme picker, and a word that
collides with a command name is swallowed by the command. A shell waiting at a `read` prompt, or
asking for a password, cannot be given `theme` or `files` without the `!` prefix. The command bar
warns about none of this; `!` is the override, and it is documented in `help`.

First refusal means what it says. A line the application answers itself — a bare word that opens a
picker, `quit` or `/quit`, or `close` or `/close` that would take the last tab with it — is answered
here rather than sent onward. A quit typed in a shell tab asks the same confirmation it asks anywhere
else (see [[quit-confirmation]]), and a bare word opens the same picker.

A command that answers with text rather than opening something — `help`, for one — records that text
in this tab's transcript. A shell tab draws a terminal in place of a transcript, so nothing appears
on screen for it.

**Tab completion is the application's.** `Tab` in the command line asks the same completion the agent
tab's bar asks, and shows the same strip when there is a choice to make. The shell tab keeps no list
of its own. One match completes the line, several matches show the choice strip, and no matches leave
the line unchanged.

## Keys

`Ctrl+C`, `Ctrl+D` and `Ctrl+Z` in the command line send interrupt, end-of-input and suspend to the
shell — the characters a terminal would send, and the only way to stop a runaway command now that
nothing can be typed into the terminal. `Ctrl+C` copies the command line's own selection instead when
it holds one, so copying by keyboard still works.

`Up` and `Down` walk the lines the command bar has sent, exactly as the agent tab's bar walks its
tab's command history. Because nothing can be typed into the terminal directly, that list is the
whole of this shell's history rather than a subset of one.

Every other chord belongs to the application, unchanged: `Ctrl+A` opens the task picker, `Ctrl+G` the
tab navigator, `Cmd+P` quick open and `Cmd+Shift+F` the project search, all with the cursor in the
command bar, exactly as in an agent tab. `Cmd+F` and `Ctrl+E` do nothing here — a plugin tab has no
transcript to search and the queue belongs to agents — which is the same in every plugin tab.

`Ctrl+R` opens this tab's own history while it is the visible one, listing the lines its command bar
has sent. Focus any other tab and `Ctrl+R` opens the application's history picker again.

The list is driven by the keyboard without ever taking it from the command bar: `↑`/`↓` move the
selection, `Return` puts the chosen line back in the bar, and `Escape` closes it. Picking a row with
the mouse does the same, and either way the bar is where the keyboard is afterwards, so a recalled line
can be edited or run.

## The metadata row

The row shows the working directory the shell started in, a workspace mark when that directory is a
workspace clone, and the actions a shell tab can act on: **open file navigator here**, **new agent
here**, the split control, and the connections and schedule windows.

The connections window includes the tab's own `zsh` terminal as soon as the shell tab opens. The
connections and schedule windows auto-show for five seconds whenever the tab becomes visible, then
fade over 300 ms unless pinned or hovered. If an empty window gains its first row after that interval,
it auto-shows again; a window with no rows stays hidden.

There is no **open transcript** control, because there is no transcript: the terminal replaced it. The
working directory shown is the one the shell started in and does not follow a `cd`, so a shell that
has moved elsewhere still shows where it was opened.

## Where the shell starts

`zsh` in a tab that has a workspace clone starts the shell inside that clone, confined the same way
that tab's own shell is — which is the point of a disposable clone. Anywhere else, it starts in the
project's root directory. Both are inside the project root, and a shell cannot be started anywhere
else: a terminal only ever runs in a directory inside that root. A remote agent tab is therefore not a
place a shell tab can be opened from — its working directory belongs to the other host, and there is
nothing here to start a shell in.

The shell is always zsh, named outright rather than taken from the environment, so the tab is a zsh
tab whatever the user's login shell happens to be. It is a fully interactive zsh reading its own
startup files, which every other shell the application spawns deliberately does not do: a terminal
that ignored `.zshrc` would have no `PATH` additions, no aliases, and no prompt of the user's own.

## Lifetime

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

A paste into the command bar becomes one editable line, subject to the same `!` and command-resolution
rules as anything typed, so a multi-line paste is not run a line at a time and nothing is sent to zsh
before it has been seen.

See also [[tab-plugins]], [[shell]], [[agents]], and [[tabs]].
