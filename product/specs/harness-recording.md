# Harness Session Recording

Every named-harness session (claude, opencode, codex — see [[harness]]) is recorded to a replayable
[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/) file under `.janissary/recordings/`.
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

Only the named-harness tabs opened through `harness <name>` are recorded — the same scope that gets
a server-side screen reader. **SSH tabs** (`ssh <destination>`) and inline / full-tab interactive
PTYs (e.g. `shell vim`) are **not** recorded: they get no screen reader either, keeping the two
observers symmetric.

### File format

The file is asciicast v2. The first line is a JSON header object:

- `version`: `2`
- `width` / `height`: the terminal dimensions the PTY was spawned at (updated by a resize that
  arrives before any output)
- `timestamp`: the session start time as an integer Unix epoch (seconds)
- `command`: the harness program name (e.g. `claude`)
- `title`: the tab label
- `env`: `{ "TERM": "xterm-256color" }`, matching the PTY's terminal name

Every subsequent line is a JSON event array `[<elapsed-seconds>, "<code>", "<data>"]`, where
`elapsed-seconds` is a non-decreasing float since the start time and `code` is:

- `"o"` — output: one PTY `data` chunk, verbatim (control/ANSI bytes are JSON-escaped, so an ESC
  becomes ``), one event per chunk with no batching or line-splitting.
- `"r"` — resize: `data` is `"<cols>x<rows>"`, written when the terminal is resized during the
  session.

Keystroke input is not recorded (output and resize only).

### File naming and lifecycle

The file is `.janissary/recordings/<label>-<timestamp>.cast`, where the label is sanitized (every
character outside `[\w-]` becomes `-`) and the ISO start timestamp has its `:` and `.` replaced with
`-` — the same scheme as capture files.

The file is created **lazily, on the first output**: a harness that exits before producing any output
(e.g. a binary not found on `PATH`, whose PTY exits immediately) leaves no empty file behind. A
resize arriving before the first output only updates the pending header dimensions; it does not
create the file. The file's append stream is opened on that first output and closed when the PTY
exits.

The recordings directory is **cleared at a fresh launch** and **preserved across `--relaunch`**,
matching `.janissary/captures/` — a run's recordings are bounded to that run, and a relaunch handoff
keeps them.

### Retrieval

There is no in-app retrieval command or viewer for a **recording**. Files accumulate under
`.janissary/recordings/` and are replayed externally — `asciinema play
.janissary/recordings/<file>.cast`, or any asciicast web player.

A **transcript** is opened in the app with `harness transcript <label>`, which shows the file as it
stands in a normal editor tab (see [[harness]] § Session transcript).

### Monitoring a harness tab

Because the harness's output is now captured, a harness-view tab can be a monitor target
(`monitor <persona> <harness-label>`). See [[monitoring]] for what the monitor receives: its latest
rendered screen plus its session transcript since the previous flush — never the raw recording.
