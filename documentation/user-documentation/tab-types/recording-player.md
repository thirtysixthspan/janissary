# Recording player

`play <name>` plays a session's recording in an **asciicast tab**:

```
play devbox
```

`<name>` is the name the session's tab had, which is how the recording is named — so `play devbox`
finds `devbox-2026-07-10T18-30-05-123Z.cast` under `.janissary/recordings/` and plays the most recent
recording of it. Naming the file itself works too, and is played exactly as written:

```
play .janissary/recordings/devbox-2026-07-10T18-30-05-123Z.cast
```

An [SSH session](/user-documentation/advanced-agents/harness#ssh-sessions) is played the same way, and
so is any `.cast` file given to `open` — from the command bar, or by double-clicking it in a
[file navigator](/user-documentation/tab-types/file-navigator). What plays a file is the file: `play`
looks at its extension and hands it to the tab that plays that kind of thing, so a recording is reached
by the name of the session that wrote it whether or not that session is still running. A video plays
the same way, with `play clip.mp4`, and a track with `play track.mp3`.

Every [harness](/user-documentation/advanced-agents/harness#recordings), SSH, and
[shell](/user-documentation/command-bar/shell#open-a-zsh-shell-tab) tab is recorded
automatically, so this is the way to watch a session again: one still running, or one whose tab has
closed and whose scrollback went with it. See
[Playing a recording back](/user-documentation/advanced-agents/harness#playing-a-recording-back) for the
full description.

While the tab that made the recording is still open, you do not need its name: its
[recording flag](/user-documentation/advanced-agents/harness#the-recording-flag) in the metadata row
opens the recording directly, following it if the session is still running.

## What it looks like

The tab is a terminal of its own showing the session's output as it was on screen, at the size it was
recorded at — the columns and rows it ran in, following any window resize it did — at the same text
size as any other terminal. Nothing is scaled to fit: a recording wider or taller than the tab is cut
off at the tab's edge rather than shrunk or given a scrollbar, so make the window big enough to see the
whole of it. Docking the tab into a narrow sidebar shows less of the recording, not a smaller one.
Above it is a line saying what is playing: the command the session ran, the label, when it started, how
long it is, and the session's exit status when the recording carries one. Below it is the transport.

Text can be selected in the recording and copied with `Cmd+C` (or `Ctrl+C`), the same as in any
terminal.

## What it can do

Play and pause, speed from 0.5× to 4×, one recorded moment at a time forward and back, and a seek bar.
Every one of those is a button as well as a key:

| Key | Does |
| --- | --- |
| `Space` or `p` | Play, or pause |
| `.` | Next recorded moment |
| `,` | Previous recorded moment |
| `]` / `[` | Faster / slower |

Seeking backwards rebuilds the frame from the recording rather than storing every frame, so jumping
back into a long recording takes a moment.

A recording plays at the timing it happened at: a pause in the session is a pause in the playback, at
its real length. Nothing in the player shortens it.

A recording of a session that is **still running** is followed: new output extends the timeline, the
metadata line reads `live`, and reaching the end holds the last frame and continues rather than
stopping. The badge reports the session rather than the last thing it said, so it stays on while a
session sits waiting for your next prompt.

A slow initial load finishes before the player checks for new output. Switching away and back during a read continues from where it reached without adding duplicate moments to the timeline.

A recording of a session that has **ended** simply plays out. Speed is the way through an unattended
run rather than silence. See
[Recordings](/user-documentation/advanced-agents/harness#playing-a-recording-back).

## Where it lives

The tab is an ordinary tab: it docks into either sidebar, takes a **Split** control, and can be closed
like any other. Playback pauses while it is not the visible tab and resumes where it stopped. Playback
state is not kept after the tab closes — reopen the recording and it starts from the beginning.

## Turning shell recording off

Shell tabs are recorded like the other recorded tabs: a file under `.janissary/recordings/`, and a film
flag in the tab's metadata row that opens the recording. To record no shell tab in a project, set this
in its `.janissary/config.json`:

```json
{ "recordShellTabs": false }
```

No shell file is written and no shell tab draws the flag. Named `harness` and `ssh` tabs are unaffected —
they have no echo of their own, so they are recorded whatever this says. The setting is on unless a
project turns it off.
