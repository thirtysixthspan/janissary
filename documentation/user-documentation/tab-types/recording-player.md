# Recording player

`harness replay <label|file.cast>` plays a session's recording in a tab:

```
harness replay claude
```

`ssh replay <label|file.cast>` does the same for an [SSH session](/user-documentation/advanced-agents/harness#ssh-sessions), and so does `open` on any `.cast` file — from the command bar, or by double-clicking it in a [file navigator](/user-documentation/tab-types/file-navigator).

Every [harness](/user-documentation/advanced-agents/harness#recordings) and SSH tab is recorded automatically, so this is the way to watch a session again: one still running, or one whose tab has closed and whose scrollback went with it. See
[Playing a recording back](/user-documentation/advanced-agents/harness#playing-a-recording-back) for the
full description.

## What it looks like

The tab is a terminal of its own showing the session's output as it was on screen, at the size it was
recorded at — the columns and rows it ran in, following any window resize it did — with the font
scaled to fit the pane. Above it is a line saying what is playing: the command the session ran, the
label, when it started, how long it is, and the session's exit status when the recording carries one.
Below it is the transport.

Text can be selected in the replay and copied with `Cmd+C` (or `Ctrl+C`), the same as in any terminal.

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

A recording of a session that is **still running** is followed: new output extends the timeline, the
metadata line reads `live`, and reaching the end holds the last frame and continues rather than
stopping.

A recording of a session that has **ended** has its silences compressed — two seconds each, unless the
`idle` control says otherwise — because an unattended run is mostly waiting. See
[Recordings](/user-documentation/advanced-agents/harness#playing-a-recording-back).

## Where it lives

The tab is an ordinary tab: it docks into either sidebar, takes a **Split** control, and can be closed
like any other. Playback pauses while it is not the visible tab and resumes where it stopped. Playback
state is not kept after the tab closes — reopen the recording and it starts from the beginning.