# Harness Session Recording

Every named-harness session (claude, opencode, codex — see [[harness]]) is recorded to a replayable
[asciicast v3](https://docs.asciinema.org/manual/asciicast/v3/) file under `.janissary/recordings/`.
Recording is **automatic** — there is no command to start or stop it — and it captures the full timed
PTY byte stream (ANSI and all) for the whole session, so a harness's output survives after its tab
closes (which is when its own scrollback would otherwise be lost, see [[harness]] § Lifecycle).

### The three harness observers

A harness tab produces three distinct artifacts, each answering a different question:

- A **capture** (see [[harness]] § Screen capture) is a point-in-time text snapshot of the visible
  screen, written on demand by `harness capture <label>`.
- A **recording** is the entire timed PTY byte stream, written automatically — everything the
  terminal showed, in the order and at the pace it showed it.
- A **transcript** (see [[harness]] § Session transcript) is the session's linear history in
  normalized text, extracted automatically from the record the harness binary keeps in its own
  configuration directory. It is the only one of the three that carries **subagent** activity: when a
  harness dispatches a subagent, the terminal shows only a collapsed progress line, so the subagent's
  own prompts, tool calls, and results appear in neither the screen nor the recording.

### Session transcripts

Each harness records its session in its own way, and a monitored tab's transcript is read from
whichever applies:

- `claude` — one file per session in its projects directory, named after the tab's working
  directory, plus one file per subagent the session dispatched.
- `codex` — one rollout file per session, filed under the date the session started and identified by
  the working directory recorded in its header.
- `opencode` — rows in its session database, where a subagent is a session whose parent is the tab's
  own session.

A tab follows only the session belonging to its own running harness process, starting from the moment
the tab opened: earlier sessions in the same directory are never read, and no history predating the
tab is imported. The harness's own directories are only ever read, never written to, and a harness
launched into a sandboxed workspace (`-w`) still records its session normally.

Entries are labeled with the subagent that produced them, so a subagent's work stays
distinguishable from the parent's once the two are interleaved.

The transcript file is `.janissary/harness-transcripts/<label>-<timestamp>.txt`, named on the same
scheme as captures and recordings. It is created **lazily, on the first entry** — a harness that
never produces one leaves no empty file — appended to for the life of the tab, and never truncated.
Closing the harness tab or quitting the application stops transcript collection and closes the file.
The directory is **cleared at a fresh launch** and **preserved across `--relaunch`**, matching
`.janissary/recordings/`. It is separate from `.janissary/transcripts/`, which holds ordinary tabs'
own logs.

A session record is not created the instant a harness starts; the binary writes it on its first turn,
and the tab keeps looking until it appears. When none can be found, the tab silently keeps its
existing behavior — screen snapshots to monitors, no transcript file — and a single
`no harness transcript found` line is recorded in the notifications feed for that tab (see
[[notifications]]), never repeated. The same applies when a harness's storage format is not one this
version recognizes. SSH tabs get no transcript and no such notification: they share the harness tab
shape but run no harness.

### Scope

Named-harness tabs opened through `harness <name>` and **ssh tabs** (`ssh <destination>`, see
[[ssh-tab]]) are recorded — the same scope that gets a server-side screen reader, keeping the two
observers symmetric. Recording is automatic for an ssh session too: there is no flag, command, or
setting, and every session records from spawn to exit. Inline / full-tab interactive PTYs (e.g.
`shell vim`) get neither observer and are **not** recorded.

### File format

The file is asciicast v3 — the format `asciinema rec` writes by default, and the one `asciinema play` reads alongside the older v2. The first line is a JSON header object:

- `version`: `3`
- `term`: the terminal the session ran in — `cols` / `rows` are the dimensions the PTY was spawned at
  (updated by a resize that arrives before any output), and `type` is the PTY's terminal name
- `term.theme`: the foreground and background the session was recorded under, or absent when the
  tab's terminal had not reported them by the first output
- `timestamp`: the session start time as an integer Unix epoch (seconds)
- `command`: what the session ran — a named harness writes the bare program name (e.g. `claude`), an
  ssh tab writes its whole verbatim invocation (e.g. `ssh -p 2222 admin@host`), so a stray recording
  names the host it came from. An invocation carrying a secret in a flag value therefore puts that
  secret in the header.
- `title`: the tab label

There is no `env`: the terminal type moved under `term`, and it was the only variable ever captured.
There is no `palette` either — the sixteen ANSI colours are the terminal emulator's own and are the
same on every recording this app makes, so a recorded theme carries exactly the two colours an app
theme can change here. There is no `idle_time_limit` either: a recording plays at the timing it
happened at, and a header saying otherwise would only tell a player to rewrite it. A recording made
by another tool may state one, and it is played at its own timing regardless.

Every subsequent line is a JSON event array `[<interval-seconds>, "<code>", "<data>"]`, where
`interval-seconds` is the gap **since the previous event** rather than the time since the start — the
one thing v3 changed about the event stream, and the reason a v2 file has to be read differently — and
`code` is:

- `"o"` — output: one PTY `data` chunk, verbatim (control/ANSI bytes are JSON-escaped, so an ESC
  becomes ``), one event per chunk with no batching or line-splitting.
- `"r"` — resize: `data` is `"<cols>x<rows>"`, written when the terminal is resized during the
  session.
- `"x"` — exit: `data` is the session's exit status as a number, written as the last line when the
  PTY reports one. A session ended by its tab closing or by the application shutting down reports
  none, and none is invented for it.

Intervals are rounded to milliseconds with the accumulated error carried into the next one, so a long
recording's timings do not drift apart from the session they record. Keystroke input is not recorded
(output, resize, and exit only).

A **v2** file — one written by an earlier version, or by another tool — stays playable: its
top-level `width` / `height` and its absolute times are read as the older shape, and the same
timeline comes out of it.

### File naming and lifecycle

The file is `.janissary/recordings/<label>-<timestamp>.cast`, where the label is sanitized (every
character outside `[\w-]` becomes `-`) and the ISO start timestamp has its `:` and `.` replaced with
`-` — the same scheme as capture files.

The file is created **lazily, on the first output**: a harness that exits before producing any output
(e.g. a binary not found on `PATH`, whose PTY exits immediately) leaves no empty file behind. A
resize arriving before the first output only updates the pending header dimensions; it does not
create the file. The file's append stream is opened on that first output and closed when the tab
closes, when the PTY exits, or when the application shuts down, whichever comes first. Closing the
tab is enough on its own: a detached remote harness, whose PTY never reports an exit locally, stops
recording when its tab goes. A PTY that later reuses the same session id (an attach bringing the tab
back) starts a new recording file rather than appending to the earlier one.

The recordings directory is **cleared at a fresh launch** and **preserved across `--relaunch`**,
matching `.janissary/captures/` — a run's recordings are bounded to that run, and a relaunch handoff
keeps them.

Harness and ssh recordings share one directory, so telling them apart means reading a file's header
`command` field or recognizing the tab label in its name. Two concurrent sessions to the same ssh
destination are labeled `devbox` and `devbox-2`, so their recordings never collide.

If a recording cannot be written at all — an unwritable recordings directory, say — the session
itself is never affected; it simply stops being recorded. Either kind of session reports the gap
once in the notifications feed for its own tab (see [[notifications]]): an **ssh tab** records a
single `ssh recording failed` line, and a **harness tab** a single `harness recording failed` line.
Neither is ever repeated, and both appear even while that tab is the active one. This is distinct
from `no harness transcript found`, which is about a missing session record and never fires for an
ssh tab.

### Retrieval

A **recording** is played back in the app by `harness replay <label>` (and `ssh replay <label>` for an
ssh tab), which opens a **replay tab** showing what the session did. `open <file>.cast` opens one too,
from the command bar or from a file navigator row.

The target is a tab label or a path to a `.cast` file, told apart by the extension: a target ending in
`.cast` is a path, and anything else is the label of a tab that is open right now. A label names that
tab's own recording; a path names a file, which is how a recording whose tab has since closed is
reached. Both commands resolve the target the same way and open the same tab.

The replay tab:

- **plays the recording from the beginning**, at the size it was recorded at, into a terminal of its
  own — the recorded columns and rows, with each recorded resize applied as it happened, rendered at
  the app's own terminal font size. Nothing is scaled to fit the tab: a recording larger than the tab
  is clipped rather than scrolled or shrunk, and the window is resized to see all of it;
- **transports**: play and pause, speed from 0.5× to 4×, one recorded event at a time forward and back,
  and a seek bar. Every one is a button as well as a chord — Space or `p`, `,` and `.`, `[` and `]` —
  and there are no markers;
- **follows a live session**: while the session is still recording, the timeline extends as output
  arrives, the metadata line reads `live`, and reaching the end of what has been recorded holds the
  last frame and continues rather than reporting the replay finished;
- **plays at the timing it was recorded at**, silences at their real length. A recording is the only
  record of what a session did, and shortening the gaps would make a run that waited ten minutes
  indistinguishable from one that answered in ten seconds;
- **shows what the recording is**: the command it ran, the label, when it started, how long it is, the
  session's exit status when the recording carries one, and any reason the file could not be read;
- **lets you select text and copy it** with `Cmd+C` / `Ctrl+C`;
- **pauses while it is not the visible tab**, and resumes where it stopped.

A recording that will not parse, or that has no events yet, still opens as the player, with the reason
on the metadata line.

Files also accumulate under `.janissary/recordings/` and remain playable outside the app — `asciinema
play .janissary/recordings/<file>.cast`, which needs asciinema 3.x for a recording written by this
version, or any asciicast web player.

A **transcript** is opened in the app with `harness transcript <label>`, which shows the file as it
stands in a normal editor tab (see [[harness]] § Session transcript).

### Monitoring a harness tab

Because the harness's output is now captured, a harness-view tab can be a monitor target
(`monitor <persona> <harness-label>`). See [[monitoring]] for what the monitor receives: its latest
rendered screen plus its session transcript since the previous flush — never the raw recording.
