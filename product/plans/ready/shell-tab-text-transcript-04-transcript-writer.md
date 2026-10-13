# Shell tab text transcript 04: `ShellTranscriptWriter`

**Complexity: 6/10** — a new per-PTY observer that mirrors the byte stream into an `@xterm/headless` terminal and writes rows by tracking a forward-only xterm marker across scrolling, scrollback trimming, cursor-up redraws, `clear`/reset, auto-wrap and alternate-screen switches, with an exit/dispose finishing path that must drain xterm's asynchronous parse before the final flush; the state reasoning is the hardest part of the feature, but it is two small modules with close precedents (`HarnessScreenReader`, `HarnessRecorder`) and is not wired to anything yet.

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
- **Decision 7** — no file size cap; the in-memory pending-write limit is `BoundedAppendFile`'s 4 MiB rule (`MAX_PENDING_APPEND_BYTES`); exceeding it stops the transcript for the rest of the session and fires the failure callback.
- **Decision 10** (writer half) — any write failure (unwritable directory, pending limit, stream error) fires the writer's `onFailure` at most once and never throws into the bus; the shell is unaffected. The writer is independent of the recorder.
- **Decision 11** — on exit or disposal the cursor's unfinished row is written as-is, then the file is closed.
- **Decision 15** — row tracking by an xterm marker (`registerMarker(0)` on the cursor's row) whose `line` follows its row through scrolling, trimming and reflow; a disposed marker resumes the writer without repeating rows; flushing on `onLineFeed`; bounded scrollback keeps rows scrolled off since the last line feed readable; during the alternate buffer nothing is written and the normal buffer's marker is left in place. The "Row tracking" section below refines the literal source wording where the installed xterm behaves differently from what it assumed (verified against `@xterm/headless` 6.0.0).
- The source plan's **scrollback value** (1000 rows, with the accepted loss of a single unbroken line longer than 1000 × columns, noted in the writer's comment) and its **"remote shells need no special case"** note (the writer sees the same `pty` bus events on the recorded PTY id; installation is subplan 05).

## Dependencies

- Subplan 01 — `BoundedAppendFile` (landed: `src/bounded-append-file.ts`).
- Subplan 03 — `src/shell/transcript/transcript-file.ts` (landed: `ensureShellTranscriptDirectory`, `shellTranscriptPath`, `initShellTranscriptDirectory`).

Both are committed, so this subplan has no ordering constraint of its own; nothing outside `src/shell/transcript/` changes.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `BoundedAppendFile(resolvePath, maxPendingBytes, onFailure)` with `write(line)`, `isOpen()`, `openedPath()`, `dispose()`, and `MAX_PENDING_APPEND_BYTES` | `src/bounded-append-file.ts` | The file. It has **no** `onOpened` hook: the caller announces the path itself after the opening write, exactly as `HarnessRecorder.open()` does at `src/harness/recorder.ts:103` (`this.file.write(…)` then `const path = this.file.openedPath(); if (path !== undefined) this.onOpened?.(path)`). Its `onFailure` fires once on an open throw, a stream `'error'`, or a write that would exceed the limit; `write` is a no-op afterwards; `dispose()` ends the stream (it does not wait for the flush to reach disk). |
| Path factory shape | `src/harness/recorder.ts:40` (`new BoundedAppendFile(() => { ensureRecordingDirectory(); return harnessRecordingPath(this.label, this.startedAt); }, MAX_PENDING_APPEND_BYTES, …)`) with `startedAt = Date.now()` at construction (`:28`) | Same shape with `ensureShellTranscriptDirectory()` and `shellTranscriptPath(label, startedAt)` from `src/shell/transcript/transcript-file.ts`. |
| CommonJS default-import workaround for `@xterm/headless` | `src/harness/screen.ts:1` (`import xterm, { type Terminal } from '@xterm/headless'`) and `:10` (`const { Terminal: HeadlessTerminal } = xterm`), with the explanatory comment at `:4-9` | Copy the import pattern (also import `type IMarker` type-only). A named value import throws under Node. |
| "Read the buffer only after `write('', cb)` drains" rule | `src/harness/screen.ts:69-71` (`this.term.write('', () => { if (this.disposed) return; …`) | The finishing path. |
| `pty` bus subscription filtered by id over `data` / `resize` / `exit` | `src/harness/recorder.ts:48` (`messageBus.on('pty', ['data', 'exit', 'resize'], (event) => { if (event.id !== this.id) return; …`); event shapes at `src/bus.ts:139-140` | Same subscription shape. |
| xterm API, `node_modules/@xterm/headless/typings/xterm-headless.d.ts` | `IMarker` `:398` (`line`, `-1` once disposed; `isDisposed`; `onDispose`), `onLineFeed` `:731`, `registerMarker` `:792` (returns `undefined` while the alternate buffer is active), `write(data, callback)` `:847`, `IBuffer.type`/`cursorY`/`baseY`/`length` `:958-987`, `translateToString` `:1073`, `parser` `:634` with `registerEscHandler` `:1274` | Row detection. |
| Real-temp-dir test harness: `emit` helper, `waitFor` polling, `locked` chmod cleanup, the "no file when only a resize arrives" check | `src/harness/recorder.test.ts:18`, `:38`, `:34-53`, `:179`, unwritable-parent case at `:315-329` | Test harness pattern. |

## Verified `@xterm/headless` 6.0.0 behaviour the design relies on

Checked by running the installed package; an implementer must not "simplify" these away.

- `registerMarker`, `buffer` reads and `parser` all throw `You must set the allowProposedApi option to true` without `allowProposedApi: true`. The writer sets it (as `screen.ts:38` does).
- `write()` parses asynchronously: no `onLineFeed` fires during the `write` call itself, and the `write('', cb)` callback runs on a later macrotask (after microtasks and `setImmediate`). Its callback still fires after `dispose()`, so the callback must check the writer's own state first, as `screen.ts:71` does.
- `onLineFeed` fires after the cursor has moved: inside the handler the cursor's absolute row (`baseY + cursorY`) is the new row, so the row just finished is that minus one. It fires for LF, VT and FF but not for auto-wrap, `ESC D` or `ESC E`; rows advanced those ways are picked up by the next flush because the flush range runs from the marker to the cursor.
- A marker is disposed by: trimming (its row scrolled out of a full scrollback), `ED 2` (`\x1b[2J`) on a viewport row, and `ED 0` (`\x1b[J`) on a row below the cursor's row. It is **not** disposed by `ED 0`/`EL` on the cursor's own row, by `ED 3` (`\x1b[3J`, which shifts it up instead), by a resize (reflow moves it with its row), by the alternate-screen round trip (`\x1b[?1049h … l`), or by a full reset `RIS` (`\x1bc`), which leaves it at its old index over a wiped buffer.
- A replacement marker registered inside an `onDispose` callback is itself disposed by the same erase, so resumption cannot be done from `onDispose`.

## Proposed changes

### `src/shell/transcript/writer.ts` — lifecycle

`ShellTranscriptWriter(ptyId, label, cols, rows, onFailure, onOpened)`, where `onFailure: () => void` and `onOpened: (path: string) => void` are both required (the recorder's reason for a required `onFailure`, `recorder.ts:16-18`, applies; subplan 05 always supplies both). Public surface: the constructor and `dispose(): void`. No path accessor, no promise, no `onClosed` hook — subplan 05 learns the path only through `onOpened` (source decision 17), and tests observe completion by polling the file (see Tests).

- Construction: records `startedAt = Date.now()`; creates the headless terminal at `cols × rows` with `scrollback: 1000` and `allowProposedApi: true`; builds the `BoundedAppendFile` with the path factory above, `MAX_PENDING_APPEND_BYTES`, and the failure handler; hands the terminal and a line sink to the row tracker (next section); subscribes to the `pty` bus for its id. The scrollback comment records why 1000 suffices (only the rows between two line feeds must survive) and the accepted loss: a single unbroken line longer than 1000 × columns has its marker trimmed away, and of that line only the row it ends on is written.
- `data` → if the file is not yet open, open it first by writing the empty string (`file.write('')` creates the file — verified — without adding content), then fire `onOpened(openedPath())` once if a path came back, in the recorder's `open()` order; then `term.write(data)`. This is how decision 2 and source decision 17 ("the file opens on the shell's first output … the button appears as the shell starts") hold even though zsh's first prompt has no line feed. An empty `data` string does not open the file.
- `resize` → `term.resize(cols, rows)`; later rows wrap at the new width, and xterm reflows unwritten rows with the marker following them.
- `exit` → the finishing path.
- Failure handler (passed to `BoundedAppendFile`): runs the finishing path, then calls `onFailure()`. `BoundedAppendFile` already guarantees it fires at most once. It can be invoked from inside an `onLineFeed` handler during xterm's parse (pending limit), so it must not dispose the terminal synchronously — the finishing path's drained callback does that.
- Finishing path, shared by `exit`, `dispose()` and failure, guarded by a `finished` flag so any second call is a no-op: unsubscribe from the bus at once (nothing arrives after); then `term.write('', cb)`, so every chunk already queued is parsed — and flushed by its own line feeds — first; in the callback, ask the row tracker for the final flush (decision 11; a no-op on a failed file because `write` is), `file.dispose()`, then `term.dispose()`. `dispose()` therefore returns before the final row reaches the stream; the flush lands one macrotask later and the bytes reach disk after that.
- Never throws into the bus: the bus's per-listener try/catch exists (`src/bus.ts:3`), but every failure here routes through `BoundedAppendFile`'s fail-once callback instead.

### `src/shell/transcript/row-tracker.ts` — row tracking (decision 15)

The marker logic lives in its own module from the start (not "extract if it grows"), so `writer.ts` stays a lifecycle shell well under the 200-line limit and the hardest reasoning has one home. `TranscriptRowTracker` is constructed with the headless terminal and a sink `(text: string) => void` that receives a whole flush (rows joined, each followed by `\n`) as **one** `BoundedAppendFile.write` call. It subscribes to `term.onLineFeed` and registers the reset hook; it exposes `finish()` for the final flush. It is not exported beyond the writer's use, and has no test file of its own — the writer's tests cover it through real bus events.

State: one marker for the next row to write, registered with `registerMarker(0)` on the cursor's row at construction. Throughout, `C` is the cursor's absolute row (`buffer.active.baseY + buffer.active.cursorY`), and a row's text is `buffer.active.getLine(i)?.translateToString(true) ?? ''`.

- **On a line feed**, if `buffer.active.type` is `'alternate'`: do nothing; the normal buffer's marker stays where it is (decision 6).
- **On a line feed in the normal buffer**, three cases:
  - Marker alive and `marker.line ≤ C − 1`: write rows `marker.line … C − 1`, dispose the marker, register a fresh one on the cursor's row.
  - Marker alive and `marker.line ≥ C`: the cursor has moved up into rows already written (a multi-line progress redraw, a zsh completion list being redrawn) and has not yet passed the marker. Write nothing and leave the marker where it is. The marker only ever moves forward; this is what makes "a row redrawn later keeps its first-written form" hold without the redrawn rows being appended a second time. Re-registering on the cursor's row here, as the source's literal wording would, writes every redrawn row again.
  - Marker disposed (trimmed away, erased by `ED 0`/`ED 2` as part of `clear` or a zle redraw, or disposed by the reset hook): write row `C − 1` only — the row the line feed just finished — then register a fresh marker on the cursor's row. Resuming "from the cursor's row" as the source words it would drop that row: after `clear` the first prompt-and-command row would never be written. Accepted consequences, recorded in a comment: rows that auto-wrapped between the erase and the first line feed after it lose all but their last row; when an `ED 0` erases rows below a row already written, that row is written a second time in its current form.
- **Reset hook**: `term.parser.registerEscHandler({ final: 'c' }, …)` disposes the marker and returns `false`, so xterm's own `RIS` still runs. Without it a `reset` would leave the marker at its old index over a wiped buffer and the first rows after it would be skipped. Verified to fire and to let the reset proceed.
- **`finish()`** (called from the writer's drained callback): if the alternate buffer is active, write nothing. Otherwise, with the marker alive and `marker.line ≤ C`, write rows `marker.line … C`; with it alive and above the cursor, write nothing (the cursor's row was already written); with it disposed, write row `C` only. The cursor row is written as-is even when blank — `translateToString(true)` makes a waiting prompt `> ` arrive as `>`.

## Tests

New `src/shell/transcript/writer.test.ts` (test files are exempt from `max-lines`, `eslint.config.mjs:116`), in the style of `src/harness/recorder.test.ts`: `mkdtempSync` project directory with `initShellTranscriptDirectory(projectDir)` in `beforeEach`, an `emit` helper over `messageBus.emit('pty', …)`, writers disposed and locked directories restored in `afterEach`.

Completion is observed by polling, not by a hook: each test ends its input with a sentinel left on the cursor's row without a line feed (for example `END`), triggers `exit` or `dispose()`, polls the single `.txt` file until its content ends with `END\n`, and then asserts the **whole** file with `toBe`/`toEqual` — the sentinel is the last thing written to a single ordered stream, so its arrival proves nothing else is still pending, and exact equality is what catches repeated or skipped rows. Input uses `\r\n` line endings, as a PTY delivers them. Each case and its exact expected lines:

- SGR colours and cursor movement in `\x1b[31mred\x1b[0m\r\n` and similar input are absent: the file is `red`, `END`.
- A prompt line and a command's output (`> ls\r\nfile\r\n`) are written.
- A carriage-return progress line (`10%\r50%\r100%\r\n`) is written once, as `100%`.
- A line wider than the terminal (construct at a small width, for example 10 columns) is written as its wrapped rows, one file line each.
- Alternate-screen content (`before\r\n\x1b[?1049hvim stuff\r\nmore\r\n\x1b[?1049lafter\r\n`) is absent; `before` and `after` are present.
- A row redrawn after being written is not written again: `a\r\nb\r\n\x1b[2AX\r\nc\r\nd\r\n` then `END` gives `a`, `b`, `d`, `END` (the overwrites `X` and `c` land on rows already written).
- 1500 numbered lines in one `data` event are written as exactly `0` … `1499` in order, past the 1000-row scrollback.
- `clear` neither repeats nor drops: `a\r\n> clear\r\n\x1b[H\x1b[2J\x1b[3J> ls\r\nfile\r\n` then `END` gives `a`, `> clear`, `> ls`, `file`, `END`.
- A full reset neither repeats nor drops: `a\r\nb\r\n\x1bcx\r\n` then `END` gives `a`, `b`, `x`, `END`.
- The unfinished cursor row is flushed on `exit` and, in a separate case, on `dispose()`.
- A `resize` to a wider terminal changes the wrap width for rows written after it.
- No file is created before the first output: a `resize` alone then `dispose()`, wait briefly, and the directory is absent or empty (the recorder's case at `recorder.test.ts:179`). Conversely, after one `data` with no line feed, `onOpened` has been called once with a path inside the shell transcript directory ending `.txt`, and that file exists.
- `onOpened` fires exactly once across many `data` events.
- An unwritable parent directory (the `recorder.test.ts:315` chmod pattern) fires `onFailure` exactly once, `onOpened` never, nothing throws from `emit`, and further `data`/`exit` events are harmless.
- `exit` followed by `dispose()`, and `dispose()` twice, run the finishing path once: the sentinel appears exactly once.

The pending-byte limit and stream-error paths are `BoundedAppendFile`'s own and are covered by `src/bounded-append-file.test.ts`; the writer tests do not re-create them.

## Verification

- `./scripts/run.mjs check-diff`.
- No manual check: the writer is not installed on any tab until subplan 05.

## Settled open questions

- **Shared stem (source decision 2).** The writer and the recorder each take `Date.now()` at construction, so a tab's `.txt` and `.cast` share the `<sanitized-label>-<ISO-timestamp>` naming scheme and normally the same timestamp, but the milliseconds can differ. That is accepted: the constructor signature stays as the source plan specifies, and threading one start time through `registerShellObservers` and `HarnessRecorder` is out of scope. The spec (subplan 08) says the two files are named alike, not identical.
- **Very long unbroken lines.** Writing only the last row of a single line longer than 1000 × columns falls under the source plan's accepted loss for such lines; the writer's comment states the actual behavior.
- **Asynchronous final flush at shutdown.** Handled in subplan 05 (see the handoff below); the writer's surface does not change for it.

## Handoff to subplan 05

`dispose()` is synchronous but the final row is flushed one macrotask later (the drained `write('', cb)`), and `BoundedAppendFile.dispose()` ends the stream without awaiting it. The manager must not rely on the file being complete when `dispose()` returns.

## Out of scope

- Installing the writer, its lifecycle per tab, `tab.transcript`, and the failure notification wiring — subplan 05.
- Anything client-side — subplan 07.
- Filtering echoed input or secrets (source out-of-scope, decision 4); a total size cap or rotation (decision 7); separators/timestamps/exit statuses (decision 3); reflecting later redraws (decision 5).
