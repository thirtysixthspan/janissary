# Agent Command Queue

Every **agent** tab (`view` undefined or `'agent'`) has a command queue. While the tab's agent
is busy, anything submitted to it — typed on its own command line, or dispatched into it by
`send`, a scheduled command, an accepted monitor suggestion, or `queue <agent> <command>` — is
appended to the queue instead of running immediately. Non-agent tabs (harness, image, page, markdown, editor,
files, monitor) have no queue; input to them behaves exactly as before.

### Queueing and draining

The queue is per-tab, FIFO, and unbounded. A submission queues whenever the tab is busy, or
whenever the tab is idle but already has queued entries waiting — in the latter case the new
submission goes to the back, preserving order, and the queue immediately starts draining. Queueing
appends a `Queued: <command>` line to the issuing tab's transcript, confirming the submission was
accepted rather than silently dropped.

When the tab's busy → idle transition fires (see [[tabs]] "Busy indicator" for what busy means),
the queue drains front to back, one command at a time. If a dequeued command finishes
synchronously without making the tab busy again (for example a built-in command with no
in-flight work), the drain continues on to the next queued entry rather than stalling. The drain
pauses whenever a dequeued command opens the unprefixed-command route chooser, resuming once the
chooser is resolved (a choice made, or cancelled).

Draining runs the shell commands back to back on the same persistent shell; each command's output
is exactly what that command produced, with no internal working-directory-tracking artifacts
leaked in from adjacent commands in the drain.

### Command-line indicators

While the exposed tab is busy, its command-line prompt shows the word `queue` before the chevron icon instead of the bare chevron,
and the small dot beside it blinks — the same blink treatment as the tab-strip dot (see
[[tabs]]). The dot is vertically centered with the prompt text next to it, whether idle or
blinking. Submitting text at this point queues it rather than running it.

### Queue popup

`Ctrl+E` (or the `queue` command) opens a `queue` popup over the command line, listing the
exposed tab's queued commands in order, front (the next one to run) at the top. It no-ops if the
exposed tab is not an agent tab. When the queue is empty it shows `(no commands queued)`.

Opening the popup selects the front entry, which copies its text into the command line,
overwriting whatever was there. The command line is the popup's only edit surface:

| Input | Effect |
|---|---|
| Up / Down, or clicking a row | Selects that row, copying its text into the command line (overwriting it) |
| Typing in the command line | Patches the selected row live |
| Backspace / Delete with text present | Ordinary text editing (also patches the row) |
| Backspace / Delete on an empty line | Removes the selected row, clamps the selection, and keeps the popup open with an empty command line — repeated presses delete row after row |
| Enter / Return | No-op — does not submit, run, or close the popup |
| Escape | Closes the popup and clears the command line |

An entry backspaced to an empty string (but not yet deleted) is a legal queued row; when it
reaches the front of the queue and drains, it runs as a no-op.

A keystroke that edits a row can race a concurrent removal of that same row (e.g. the queue
draining while the popup is open); the edit is dropped in that case rather than misapplied to a
different row.

### `queue <agent> <command>` command

`queue <agent> <command...>` appends `command` to another agent's queue, regardless of that
agent's busy state — an idle target with nothing else queued runs it immediately; a busy target
(or one with entries already queued) keeps it queued behind the rest. Errors: `No tab named
"<label>".` for an unknown target, `Tab "<label>" has no command queue.` for a non-agent target.
On success the issuing tab's transcript records `→ <label> (queued): <command>`.

This is a different thing from the bare `queue` command (see "Queue popup" above), which opens
the interactive picker for the *issuing* tab's own queue rather than appending to another tab's.

### What never queues

Commands intercepted client-side before they reach the server — `hist`, `nav`, `syntax theme`,
`quit`, `close`/`exit`, bare `queue`, and bare `tasks` — always run immediately (client-side)
regardless of the target tab's busy state, and never appear in the queue. `queue <agent> <command>` is not
intercepted client-side (only the argument-less form is) and reaches the server normally. Cross-agent
messaging (`msg` / `broadcast`) keeps its own separate per-recipient delivery order (see
[[messaging]]) and is unaffected by this queue.

### Persistence

An agent tab's queue is persisted alongside its other state (see [[history]] "Persistence") and
restored on `--relaunch`. A relaunched tab always starts idle (see [[relaunch]]), so a restored
non-empty queue does not run anything on startup — it waits and starts draining on the first
command dispatched into that tab afterward.
