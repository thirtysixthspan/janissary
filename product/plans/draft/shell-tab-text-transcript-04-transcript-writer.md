# Shell tab text transcript 04: `ShellTranscriptWriter`

**Complexity: 6/10** — a new per-PTY observer that mirrors the byte stream into an `@xterm/headless` terminal and writes rows by tracking an xterm marker across scrolling, scrollback trimming, `clear`/reset, auto-wrap and alternate-screen switches, with an exit/dispose finishing path that must drain xterm's asynchronous parse before the final flush; the state reasoning is the hardest part of the feature, but it is one module with close precedents (`HarnessScreenReader`, `HarnessRecorder`) and is not wired to anything yet.

## Goal

Build `ShellTranscriptWriter`, the standalone observer that turns one shell PTY's `pty` bus events into a plain-text file of the rows the terminal displayed on its normal screen, through the shared `BoundedAppendFile`. It is fully tested here against real `pty` bus events and a real temp directory, and is not yet installed on any tab (subplan 05).

Source plan: implementation-order step 5.

## Design decisions carried from the source plan

- **Decision 1** — the PTY stream is parsed by a server-side `@xterm/headless` terminal; what is written is that terminal's rendered rows, so colours, cursor movement, carriage-return redraws and other control sequences never reach the file.
- **Decision 2** (the lazy-creation half) — the file is created lazily on the shell's first output, so no file exists before it.
- **Decision 3** — every normal-screen row is written: prompts, typed command lines, output, background-job output, startup-file output. No separators, timestamps or annotations.
- **Decision 4** (mechanism) — no attempt is made to distinguish echoed input from output; the writer writes rows as displayed.
- **Decision 5** — one file line per screen row, written once, when the cursor first moves below it; wrapped long lines are written as their wrapped rows at the then-current width; a row redrawn later keeps its first-written form; `clear` removes nothing already written; a row redrawn by carriage returns before the cursor leaves it is written once in its final form.
- **Decision 6** — nothing is written while the alternate buffer is active; normal-screen output before and after still is.
- **Decision 7** — no file size cap; the in-memory pending-write limit is `BoundedAppendFile`'s 4 MiB rule; exceeding it stops the transcript for the rest of the session and fires the failure callback.
- **Decision 10** (writer half) — any write failure (unwritable directory, pending limit, stream error) fires the writer's `onFailure` at most once and never throws into the bus; the shell is unaffected. The writer is independent of the recorder.
- **Decision 11** — on exit or disposal the cursor's unfinished row is written as-is, then the file is closed.
- **Decision 15** — row tracking by an xterm marker (`registerMarker(0)` on the cursor's row), re-registered after each flush; a disposed marker (trimmed, or erased by `clear`/reset) resumes from the cursor's row; flushing on `onLineFeed` writes from the marker's `line` up to the row above the cursor; exit/dispose writes through the cursor's row; bounded scrollback keeps rows scrolled off since the last line feed readable; during the alternate buffer nothing is written and the normal buffer's marker is left in place.
- The source plan's **scrollback value** (1000 rows, with the accepted loss of a single unbroken line longer than 1000 × columns, noted in the writer's comment) and its **"remote shells need no special case"** note (the writer sees the same `pty` bus events on the recorded PTY id; installation is subplan 05).

## Dependencies

- Subplan 01 — `BoundedAppendFile`.
- Subplan 03 — `src/shell/transcript/transcript-file.ts` (`ensure…`, `shellTranscriptPath`).

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `BoundedAppendFile` | `src/bounded-append-file.ts` (subplan 01) | Lazy open, 4 MiB pending limit, fail-once, close |
| Shell transcript directory module | `src/shell/transcript/transcript-file.ts` (subplan 03) | Path factory: ensure the directory, then `shellTranscriptPath(label, startedAt)` |
| CommonJS default-import workaround for `@xterm/headless` and the "read the buffer only after `write('', cb)` drains" rule | `src/harness/screen.ts:1-10`, `:69` | Copy the import pattern; follow the drain rule on exit/dispose |
| `pty` bus subscription filtered by id over `data` / `resize` / `exit` | `src/harness/recorder.ts` constructor | Same subscription shape |
| xterm API: `onLineFeed`, `registerMarker`, `IMarker.line`/`isDisposed`, `buffer.active.type`, `buffer.normal`, `translateToString(true)`, `cursorY`/`baseY` | `node_modules/@xterm/headless/typings/xterm-headless.d.ts` (`onLineFeed` at `:731`, `registerMarker` at `:792`) | Row detection |
| Real-temp-dir test style | `src/harness/recorder.test.ts` | Test harness pattern |

## Proposed changes

- New `src/shell/transcript/writer.ts` — `ShellTranscriptWriter(ptyId, label, cols, rows, onFailure, onOpened)`:
  - Subscribes to the `pty` bus for its id. Creates a headless terminal at `cols × rows` with `scrollback: 1000` and `allowProposedApi` only if `registerMarker` requires it under the installed `@xterm/headless` 6 (check the typings). The comment records why 1000 suffices (only the rows between two line feeds must survive) and the accepted loss for a single unbroken line longer than 1000 × columns.
  - `data` → `term.write(data)`. `resize` → `term.resize(cols, rows)` so later rows wrap at the new width.
  - The writer's `BoundedAppendFile` is built with the transcript directory's path factory, the shared pending-byte limit, and a failure callback that marks the writer failed, unsubscribes from the bus and fires `onFailure` once. `onOpened(path)` is fired when the file opens on the first written row; since zsh's prompt is the first output and is drawn at once, in practice that is the first `data`. The file must not exist before the first output (decision 2): open on the first row flush, or on the first `data` — pick one and make the "no file before first output" test hold.
  - `term.onLineFeed` → if `buffer.active.type` is the alternate buffer, do nothing (marker untouched). Otherwise flush: start row = the marker's `line`, or the cursor's absolute row (`baseY + cursorY`) if the marker is missing or disposed; write every normal-buffer row from start up to the row above the cursor, each as `translateToString(true)` plus `\n`; dispose the marker and register a fresh one on the cursor's row. This handler reads the buffer synchronously inside the parse, where cursor and rows are consistent. Auto-wrapped rows advance without a line feed but are picked up by the next flush because the range is from the marker to the cursor.
  - Finishing path, shared by `exit` and `dispose()`, runs once (second call a no-op): unsubscribe from the bus at once; then `term.write('', cb)` to drain xterm's parse queue; in the callback, if not in the alternate buffer, flush from the marker through and including the cursor's row (decision 11); dispose the `BoundedAppendFile`; dispose the headless terminal. Nothing else reads the buffer outside `onLineFeed` or a drained `write` callback.
  - Never throws into the bus; all failures route through `BoundedAppendFile`'s fail-once callback.
- Measure against the 200-line limit as it grows. If the flush/marker logic and the lifecycle together exceed it, extract the row-range computation and marker bookkeeping into a focused sibling (for example `src/shell/transcript/rows.ts`) rather than compacting.
- Expose a small promise or callback for "finished" if the tests need to await the drained final flush (for example `dispose()` returning a promise, or an `onClosed` hook); keep it minimal and use it from subplan 05's manager only if needed.

## Tests

New `src/shell/transcript/writer.test.ts`, real temp directory (initialise the shell transcript directory into it) and real `pty` bus events, in the style of `src/harness/recorder.test.ts`, awaiting the finishing path before reading the file:

- Escape sequences and colours (SGR, cursor movement) are absent from the file.
- A prompt line and a command's output are written.
- A carriage-return progress line is written once, in its final form.
- A line wider than the terminal is written as its wrapped rows.
- Alternate-screen content (`\x1b[?1049h … \x1b[?1049l`) is absent while normal-screen output before and after it is present.
- A row redrawn after being written (cursor moved up and overwritten) keeps its first form.
- Output past the scrollback size (more than 1000 rows in one burst) is written whole with no repeated or skipped row.
- `clear` (including its scrollback erase, `\x1b[H\x1b[2J\x1b[3J`) neither repeats nor drops rows written after it.
- The unfinished cursor row is flushed on `exit` and, separately, on `dispose()`.
- A `resize` changes the wrap width for later rows.
- No file is created before the first output.
- `onOpened` fires once with the file path; a failure (unwritable directory) fires `onFailure` once and nothing throws.
- Exit then dispose (and dispose twice) runs the finishing path once.

## Verification

- `./scripts/run.mjs check-diff`.
- No manual check: the writer is not installed on any tab until subplan 05.

## Out of scope

- Installing the writer, its lifecycle per tab, `tab.transcript`, and the failure notification wiring — subplan 05.
- Anything client-side — subplan 07.
- Filtering echoed input or secrets (source out-of-scope, decision 4); a total size cap or rotation (decision 7); separators/timestamps/exit statuses (decision 3); reflecting later redraws (decision 5).
