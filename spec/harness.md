# Harness Tab

A **harness tab** opens an AI coding harness (claude, opencode, or codex) as the entire tab body —
a live PTY terminal that takes over the tab in place of the usual transcript and command bar.

## Command

```
harness <name>
```

Valid names: `claude`, `opencode`, `codex`. The binary must be on `PATH`; if it is not found, the
PTY exits immediately and the tab freezes showing the exit status.

- `harness` with no name — error: `Usage: harness <claude|opencode|codex>.`
- `harness foo` — error: `Unknown harness "foo". Choose from: claude, opencode, codex.`

## Harness tab data

A harness tab is distinguished by `view: 'harness'` and carries a **harness payload**:

- **name** — the harness identifier (`claude`, `opencode`, or `codex`).
- **program** — the binary that was launched.
- **ptyId** — the live PTY stream id used by xterm.js to attach.
- **status** — `running` while the process is alive; `exited` once it terminates.
- **exitCode** — set when `status` is `exited`.

## Layout

A harness tab has **no command bar and no transcript**. When the active tab is a harness view, the
app renders the tab strip above a full-body terminal. Every other tab renders unchanged. Tab
switching continues to work via the tab strip or the Shift+←/→ chord.

When the harness exits, a slim **"exited (code)"** banner appears above the frozen terminal so the
last session is still visible for scrolling.

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

## Tab strip

The tab's name in the strip is the harness name (`claude`, `opencode`, `codex`) with no type
marker appended — per [[tab-label-no-markers]], the name only. A **× close button** is shown in
the strip (identical to image/page view tabs).

## Lifecycle

- **Created** by `harness <name>` — a new tab is opened, focused, and the PTY starts.
- **Running** — the harness receives all input; the connections panel lists `terminal:<name>`.
- **Exited** — when the harness process terminates, the tab freezes showing the exit status and an
  optional exit-code banner; the tab remains open for inspection.
- **Closed** — the tab's × button or `close` command kills the PTY (if still running) and removes
  the tab. Closing the last tab opens a fresh default tab.

## Placement and grouping

A harness tab is created adjacent to the active tab's group (same group number and bar color), like
an image or page view tab. It participates in tab reordering and grouping as any ordinary tab would.

## Persistence

Harness tabs are **live and in-memory** — they are not saved to agent state and are not restored on
`--relaunch`. Each launch starts fresh.

## Connections panel

While running, the harness PTY appears in the connections panel as `terminal:<name>`.
