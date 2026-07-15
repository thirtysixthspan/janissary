# Harness Tab

A **harness tab** opens an AI coding harness (claude, opencode, or codex) as the entire tab body —
a live PTY terminal that takes over the tab in place of the usual transcript and command bar. An
**ssh tab** (opened via `ssh <destination>`) is a harness-view tab of the same shape, running a
real `ssh` session instead of an AI harness — see SSH Tab for its own command grammar, connections
row, and the one place its behavior differs (the connections panel is shown, not suppressed).

## Command

```
harness <name> [as <label>] [-w] [-y] [--model <name>] [--effort <level>]
```

Valid names: `claude`, `opencode`, `codex`. The binary must be on `PATH`; if it is not found, the
PTY exits immediately and the tab closes (see [Lifecycle](#lifecycle)). See
[Launching with a model and effort level](#launching-with-a-model-and-effort-level) for `--model`
and `--effort`.

- `harness` with no name — error: `Usage: harness <claude|opencode|codex> [as <label>] [-w] [-y].`
- `harness foo` — error: `Unknown harness "foo". Choose from: claude, opencode, codex.`

Before the harness tab opens, the `harness <name> [as <label>] [-w]` command itself is recorded
in the **creator's** transcript — the tab `harness` was run from, not the new harness tab (which
has no transcript of its own). This happens synchronously ahead of the PTY spawn, so the launch
is always visible even if the harness exits — and its tab closes — immediately after.

### Custom tab label (`as <label>`)

By default a harness tab's label is the harness name (`claude`, `opencode`, `codex`), disambiguated
with `-2`, `-3`, … if that label is already in use. `as <label>` overrides this with an arbitrary
label instead, still disambiguated the same way if it collides with an existing tab:

```
harness opencode as quality   → tab "quality" running opencode
harness opencode as quality   → tab "quality-2" running opencode (label already taken)
```

The harness identity (`name`, the binary launched) is unaffected by `as` — only the tab's label
and title change. `as` and `-w`/`--workspace` may be combined in either order:

```
harness opencode as quality -w
```

- `harness claude as` (no label after `as`) — error: `Usage: harness <claude|opencode|codex> as <label>.`

### Workspace flag (`-w` / `--workspace`)

Adding `-w` (or `--workspace`) clones the root repository (detected from the current directory) into
a disposable workspace named after the harness tab's unique label, identically to `agent --workspace`:

```
harness claude -w    → tab "claude"   with workspace at .janissary/workspace/claude/
harness claude -w    → tab "claude-2" with workspace at .janissary/workspace/claude-2/
```

The harness PTY starts in the workspace directory. The workspace is removed when the tab is closed —
the tab closes immediately and the clone is deleted in the background, so closing a harness tab with
a large workspace never freezes the UI. If no git repository is found from the current directory, an
error is shown and no tab is created.
On macOS, the harness process is additionally confined to the workspace by a Seatbelt sandbox — see
[[sandbox]] and [[workspaced-agent]].

### Auto-approve permissions (`-y` / `--yes`)

Adding `-y` (or `--yes`) lets a workspaced harness run unattended: when its own CLI raises a
blocking permission prompt, the app recognizes the prompt and answers it automatically instead of
waiting for the user. Because the harness is confined to a disposable workspace clone (and, on
macOS, a sandbox), auto-approving its prompts stays low-risk — see [[workspaced-agent]].

The flag is **claude-only** and **requires** `-w`/`--workspace`:

- `harness opencode -y` (or any non-claude harness) — error: `-y/--yes is only supported for the claude harness.` The harness choice is checked first, so this error wins even when `-w` is also missing.
- `harness claude -y` without `-w` — error: `-y/--yes requires -w/--workspace: auto-approval is only allowed in a sandboxed workspace.`

`-y` combines with `as <label>` and `-w` in any order. Support for opencode and codex is future
work.

How it works: the app watches the harness's rendered-screen text (not an image), captured about a
second after output settles. When that text shows claude's permission menu — the highlighted
`❯ 1. Yes` default followed by a final `2. No`/`3. No` option — the app injects the Enter keystroke
to accept the highlighted "Yes" (it is a numbered menu, so a literal `y` would not work) and records
an `auto-approve` notification, rendered as `<label>: Auto-approved a permission prompt` (see
[[notifications]]). Detection keys on the menu structure at the bottom of the screen, so gate-shaped
text that has merely scrolled up the screen does not trigger an approval.

If an approved prompt does not clear (the same gate screen redraws unchanged), the app does not
re-send the keystroke; it records `<label>: Auto-approve could not clear the permission prompt;
standing down` once and leaves that gate alone until the screen changes. Auto-approval is in-memory
per launch — like the harness tab itself, it is never persisted or restored on `--relaunch`. As with
every notification, the `auto-approve` line is only recorded while the notifications tab is open.

A harness tab opened with `-y` shows the auto-permitting flag emoji in its metadata row — see
Metadata row in `tabs.md`.

## Harness tab data

A harness tab is distinguished by `view: 'harness'` and carries a **harness payload**:

- **name** — the harness identifier (`claude`, `opencode`, or `codex`).
- **program** — the binary that was launched.
- **ptyId** — the live PTY stream id used by xterm.js to attach.
- **status** — `running` while the process is alive. The tab is closed as soon as the process
  exits, so `exited` is not observed in normal operation.
- **exitCode** — would be set alongside an `exited` status; unused in practice since the tab
  closes before it could be read.

## Layout

A harness tab has **no command bar and no transcript**. When the active tab is a harness view, the
app renders the tab strip above a full-body terminal. Every other tab renders unchanged. Tab
switching continues to work via the tab strip or the Shift+←/→ chord.

## Focus

The xterm terminal is focused automatically in two cases:

- **On mount** — when the harness tab is first created, `term.focus()` is called so the terminal
  is ready for input immediately.
- **On tab switch** — when switching to a harness tab (via Shift+←/→, a tab-strip click, or
  `next`), the app focuses the harness terminal instead of the command-line input. Typing starts
  reaching the harness without any click.

Switching away from a harness tab restores the normal focus model (command-line input for agent
tabs; no special focus for image/page tabs).

## Input model

All keys, clicks, and mouse events are delivered to the harness **except**:

- **Shift+←/→** — the tab-switch chord, which bubbles to the window handler.
- Clicks on the tab strip — handled by the tab strip as usual.

Ctrl-combinations (`Ctrl+C`, `Ctrl+D`, `Ctrl+R`, `Ctrl+Z`, etc.) are sent to the harness.
Reorder/collapse chords (`Ctrl+←/→`, `Ctrl+T`) are **not** available while a harness is focused;
switch to another tab first.

**Shift+Enter** is translated before it reaches the PTY: instead of a bare carriage return
(which would submit), the terminal sends `ESC` + `CR` — the same sequence Alt/Option+Enter
produces in native terminals — which harnesses like claude read as a line continuation. This lets
multi-line prompts be composed in the harness without any harness-side terminal setup. This
applies to every xterm.js terminal in the app (harness tabs, interactive PTY takeover, terminal
cards).

## Tab strip

The tab's name in the strip is the tab's unique label — the harness name by default (`claude`,
`claude-2`, `claude-3`, …) or the custom `as <label>` if one was given — with no type marker
appended (per [[tab-label-no-markers]]). A **× close button** is shown in the strip (identical to
image/page view tabs). The tab's dot shows as **busy** for as long as the harness process is
alive — it does not distinguish the harness actively working from the harness idling at its own
prompt, only "a harness process is running here" from "no harness process is running."

## Lifecycle

- **Created** by `harness <name>` — the command is first recorded in the creator's transcript,
  then a new tab is opened, focused, and the PTY starts.
- **Running** — the harness receives all input; the connections panel lists `terminal:<name>`.
- **Closed** — the tab closes as soon as the harness process exits, whether from the harness
  quitting normally, crashing, or the binary not being found on `PATH`. The tab's × button or
  `close` command closes it the same way while the process is still running (killing the PTY
  first). If the harness tab is the last remaining tab, closing it — including the harness
  process exiting on its own — quits the app (see `tabs.md`). There is no frozen "exited" state
  to inspect — the harness's own scrollback is gone once its tab closes, but the full timed session
  is preserved in its recording file (see [[harness-recording]]).

## Screen capture

```
harness capture <name>
```

Writes a point-in-time text capture of a harness tab's screen to a file and opens it in a normal
editor tab. `<name>` targets an **existing harness tab by its label** (matched exactly and
case-sensitively) — not a harness type — so `harness capture claude` captures the tab labeled
`claude` rather than launching anything.

- `harness capture` with no name — error: `Usage: harness capture <name>.`
- No tab has the label — error: `No tab labeled "<name>".`
- The tab exists but is not a harness tab — error: `"<name>" is not a harness tab.`
- The tab is a harness tab with nothing captured yet (no output has settled, or it is an ssh
  tab, which is never captured) — error: `No capture available for "<name>" yet.`

Captures are taken automatically while a harness produces output: about one second after output
resumes, the current screen contents (the visible rows only, at the terminal's real dimensions,
with trailing blank rows dropped) are recorded in memory, replacing the previous capture. A
harness that goes quiet is simply not re-captured — an idle, unchanged screen never produces new
captures — so the latest capture reflects the screen as of roughly one second after its last
burst of output.

Running the command writes that latest capture to `.janissary/captures/<label>-<timestamp>.txt`
in the project directory and opens it as a regular editor tab — each invocation writes a file and
opens a new tab; the capture is a snapshot, not a live view. Capture files accumulate only within
a run: the directory is cleared at the next normal launch (a `--relaunch` handoff preserves it,
matching agent state).

## Session recording

Separately from on-demand screen capture, every named-harness session is **automatically** recorded
to a replayable asciicast file under `.janissary/recordings/` for its whole lifetime — a *recording*
is the full timed output stream, where a *capture* is a single point-in-time screen snapshot. See
[[harness-recording]] for the file format, scope (ssh and inline PTYs excluded), lazy creation, and
replay.

## Monitoring

A harness tab can be a monitor target (`monitor <persona> <harness-label>`): since a harness has no
`LogEntry` transcript, the monitor is instead fed the tab's latest **rendered screen** on each flush.
SSH harness tabs have no screen reader, so they remain unwatchable. See [[monitoring]].

## Placement and grouping

A harness tab is created adjacent to the active tab's group (same group number and bar color), like
an image or page view tab. It participates in tab reordering and grouping as any ordinary tab would.
A harness tab opened by `profile launch` instead joins the profile's own group (see Profiles).

## Persistence

Harness tabs are **live and in-memory** — they are not saved to agent state and are not restored on
`--relaunch`. Each launch starts fresh. A schedule attached to a harness tab (directly, or via a
profile's authored `schedule`/`run` entries — see Profiles) is memory-only for the same reason: it
ends when the harness's PTY exits and its tab closes (see Lifecycle above and Scheduling § Firing).

## Connections panel

While running, the harness PTY appears in the connections panel as `terminal:<name>`.

## Launching with a model and effort level

A harness tab can be opened with a model and/or an effort level selected, either from the
interactive command (`harness <name> --model <name> --effort <level>`) or via `profile launch`
(see Profiles for the harness-entry schema) — both paths behave the same way.

`--model <name>` is passed to the harness binary's `--model` flag verbatim, but is validated first
against that harness's known model catalog (currently only opencode's and claude's catalogs are
populated); an unknown model is rejected with `Unknown model "<model>" for harness "<name>" — add
it to harness-models.json.` and no tab is opened.

`--effort <level>` is passed to the harness binary's `--effort` flag verbatim, with no validation
against any fixed set of levels — an unrecognized level is simply forwarded, and a harness binary
that doesn't understand the flag ignores it. `--model` and `--effort` may be given independently or
together, in any order relative to each other and to `as <label>`, `-w`/`--workspace`, `--offline`,
and `-y`/`--yes`.
