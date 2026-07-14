# Harness Session Recording

Every named-harness session (claude, opencode, codex — see [[harness]]) is recorded to a replayable
[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/) file under `.janissary/recordings/`.
Recording is **automatic** — there is no command to start or stop it — and it captures the full timed
PTY byte stream (ANSI and all) for the whole session, so a harness's output survives after its tab
closes (which is when its own scrollback would otherwise be lost, see [[harness]] § Lifecycle).

This is distinct from [[harness]] § Screen capture: a *capture* is a point-in-time text snapshot of
the visible screen written on demand; a *recording* is the entire timed stream written automatically.

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

There is no in-app retrieval command or viewer. Files accumulate under `.janissary/recordings/` and
are replayed externally — `asciinema play .janissary/recordings/<file>.cast`, or any asciicast web
player.

### Monitoring a harness tab

Because the harness's output is now captured, a harness-view tab can be a monitor target
(`monitor <persona> <harness-label>`). See [[monitoring]] for what the monitor receives (its latest
rendered screen, not the raw recording).
