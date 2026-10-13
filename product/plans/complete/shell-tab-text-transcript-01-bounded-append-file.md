# Shell tab text transcript 01: shared bounded append file

**Complexity: 3/10** — one server-only module extracted from an existing class plus its unit tests, with the recorder moved onto it under an unchanged regression suite; no protocol, persistence or UI surface, and the subtleties (header-then-`onOpened` ordering, never lazily opening on a resize or exit, fail-once, and the `node:fs` mock the backpressure test applies to the new module) are all pinned down below.

## Goal

Extract the lazy-open, single-stream, pending-byte-limited, fail-once append logic out of `HarnessRecorder` into one shared `BoundedAppendFile` module, so the 4 MiB pending-write rule has a single implementation that both the recorder and the later shell transcript writer (subplan 04) use. Behavior of the recorder is unchanged.

Source plan: `product/plans/ready/shell-tab-text-transcript.md`, implementation-order step 1.

## Design decisions carried from the source plan

- **Decision 18** — the bounded append file is extracted from `HarnessRecorder` and shared, so the 4 MiB rule has one implementation.
- **Decision 7** (the memory half) — the pending-write limit stays 4 MiB; accepting a write that would exceed it abandons the file and fires the failure callback once. The "transcript stops for the rest of the session" consequence is realised when subplan 04 uses this module.

## Dependencies

None. Independent of subplans 02 and 03. Subplan 04 depends on this one and relies on the surface defined below (`write`, `isOpen`, `openedPath`, `dispose`, the positional constructor).

Land the new module, the recorder change, and the backpressure test's import change together: removing `MAX_PENDING_RECORDING_BYTES` from `src/harness/recorder.ts` breaks that test's typecheck until its import moves.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `HarnessRecorder` stream handling: `private open()` (the `try { ensureRecordingDirectory(); … createWriteStream(this.path, { flags: 'a' }) … } catch { this.path = undefined; this.abandon(); }` block), `private abandon()`, `private writeLine()` (the `writableLength + Buffer.byteLength(line) > MAX_PENDING_RECORDING_BYTES` check), the stream half of `dispose()` (`this.stream?.end()`), and `stream.on('error', () => { this.abandon(); })` | `src/harness/recorder.ts` | The behavior being extracted, verbatim in semantics |
| `export const MAX_PENDING_RECORDING_BYTES = 4 * 1024 * 1024` | `src/harness/recorder.ts:8` | Moves into the new module as `MAX_PENDING_APPEND_BYTES` |
| `ensureRecordingDirectory`, `harnessRecordingPath(label, startedAt)` | `src/harness/recording-file.ts` | Called by the recorder inside the path factory it hands the new module |
| Sibling top-level utility module placement | `src/atomic-write.ts` | The new file sits beside it |
| Real-temp-dir recorder tests | `src/harness/recorder.test.ts` | Regression guard; stays green and byte-for-byte unchanged |
| Stalled-stream backpressure test (`vi.mock('node:fs', () => ({ createWriteStream: () => stream }))`, `vi.mock('./recording-file.js', …)`) | `src/harness/recorder-backpressure.test.ts` | Regression guard; only its constant import changes |

## Proposed changes

- New `src/bounded-append-file.ts`, beside `src/atomic-write.ts`, exporting `BoundedAppendFile` and `MAX_PENDING_APPEND_BYTES`. Its public surface is exactly:
  - **Constructor** — positional `(resolvePath, maxPendingBytes, onFailure)`, matching the positional style of `HarnessRecorder`'s own constructor. `resolvePath` is a no-argument function returning the absolute file path; it is called once, at open time, and is responsible for ensuring the directory exists. `maxPendingBytes` is a number (both production callers pass `MAX_PENDING_APPEND_BYTES`; tests pass a small one). `onFailure` is a required no-argument callback, required for the same reason the recorder's is (`src/harness/recorder.ts`, the "required rather than optional" comment). The constructor does no I/O.
  - **`write(line)`** — returns nothing. If the file has already failed or been disposed, it does nothing — in particular it never opens a file. Otherwise, if no stream is open yet, it opens: calls `resolvePath()`, then `createWriteStream(path, { flags: 'a' })`, attaches an `'error'` handler that abandons, and records the path. A synchronous throw from either `resolvePath()` or `createWriteStream` clears the recorded path and abandons (the reasoning in the recorder's `open()` comment — a throw inside a bus listener is swallowed and would otherwise be retried on every chunk — moves here with it). Then, on the line just given (the first line included, so a header goes through the same budget), it abandons instead of writing when `writableLength + Buffer.byteLength(line)` exceeds `maxPendingBytes`, and otherwise calls `stream.write(line)`. Bytes, not characters, are counted.
  - **`isOpen()`** — true from a successful open until abandon or dispose; false before the first write, after a failed open, after abandon, and after dispose.
  - **`openedPath()`** — the path once a stream has been created, otherwise `undefined`. It is cleared only when the open itself throws; it is **kept** after a later abandon (pending-limit or stream `'error'`) and after dispose. This mirrors today's recorder exactly: `abandon()` never clears `this.path`, and `recordingPath()` keeps naming the file after the PTY exits (asserted by the "names the recording once the file is open" test in `src/harness/recorder.test.ts`).
  - **`dispose()`** — marks the file disposed and calls `end()` on the stream if one is open; idempotent; does nothing after an abandon (the backpressure test asserts `end` is never called once the stream was destroyed).
  - **Abandon** (private) — runs at most once: marks the file failed, calls `destroy()` on the stream if one exists, drops it, then calls `onFailure`. A stream `'error'` arriving after abandon or dispose re-enters it harmlessly because of the once-guard.
- No `onOpened` hook in the module. The caller learns the file opened by checking `openedPath()` after its first `write`. That is what lets the recorder keep its header-then-`onOpened` ordering: it writes the header line, then announces the path. Subplan 04's writer uses the same check.
- Directory creation stays inside the caller-supplied `resolvePath` rather than a `mkdirSync` inside `BoundedAppendFile`. This is load-bearing: `src/harness/recorder-backpressure.test.ts` mocks `node:fs` as `{ createWriteStream }` only and mocks `./recording-file.js`'s `ensureRecordingDirectory`, so a `mkdirSync` imported by the new module would be undefined under that mock and the test would abandon on open. The new module imports only `createWriteStream` (value) and `WriteStream` (type-only) from the exact specifier `'node:fs'` — not `'fs'` — so the test's `vi.mock('node:fs', …)` replaces it in the new module too. The recorder's factory calls `ensureRecordingDirectory()` then returns `harnessRecordingPath(this.label, this.startedAt)`, keeping today's ensure-then-path-then-open order.
- The constant moves with the module as `MAX_PENDING_APPEND_BYTES`; `src/harness/recorder.ts` no longer exports `MAX_PENDING_RECORDING_BYTES` and does not re-export the new name. Its one importer today is `src/harness/recorder-backpressure.test.ts` (`import { HarnessRecorder, MAX_PENDING_RECORDING_BYTES } from './recorder.js'`); that test imports `HarnessRecorder` from `./recorder.js` and `MAX_PENDING_APPEND_BYTES` from `../bounded-append-file.js`, with its uses renamed — the only permitted change to that test. Other `vi.mock('./recorder.js', …)` sites (`src/harness/manager.test.ts`, `src/harness/observers.test.ts`, `src/harness/manager-browser-test-fixture.ts`) mock only the class and need no change.
- `src/harness/recorder.ts` replaces its `stream`, `path` and `failed` fields and its `open()`, `abandon()` and `writeLine()` methods with one `BoundedAppendFile` field built in the constructor. It keeps its `subscription`, `clock`, `colors`, `startedAt` and `disposed` state and its `pty` bus wiring. Behavior, method by method:
  - The failure callback it hands the module sets `disposed`, unsubscribes the bus subscription, then calls the caller's `onFailure` — today's `abandon()` minus the stream handling.
  - `onData`: return if `disposed`. If `!file.isOpen()` (the first output), write the header line, then call `onOpened` with `file.openedPath()` if that is defined. Then write the `'o'` event. When the header itself exceeds the limit, the module has already fired the failure callback by the time `openedPath()` is checked, and the path is still set — so `onOpened` still fires after `onFailure`, exactly as today's `open()` does (its `onOpened` call follows a `writeLine` that may have abandoned). Preserve this; do not "fix" it in this subplan.
  - `onResize` and `writeEvent` gate on `file.isOpen()` (where they gate on `this.stream` today), never on `disposed` alone. This is load-bearing: `write` lazily opens, so a resize or exit arriving before the first output must not reach `file.write`, or it would create a file with no header (the "creates no file when only a resize (or nothing) arrives before dispose" test in `src/harness/recorder.test.ts` catches this).
  - `dispose()`: unchanged guard and unsubscribe, then `file.dispose()` instead of ending the stream itself.
  - `recordingPath()` returns `file.openedPath()`.
  - Comments: the class comment keeps its lazy-creation, `command`, `onFailure` and `onOpened` paragraphs; the "single long-lived append stream" sentence and the stream-error/synchronous-throw rationale move to `src/bounded-append-file.ts`, and the recorder points at that module instead of restating them.
- Both files stay under the 200-line limit; the recorder (158 lines today) shrinks.

## Tests

- New `src/bounded-append-file.test.ts`, against a real temp directory (`mkdtempSync` under `os.tmpdir()`, removed in `afterEach`) with no `node:fs` mock. The pending-byte cases use a small `maxPendingBytes` (tens of bytes) rather than a stalled stream: a real `fs.WriteStream` keeps a just-written chunk in `writableLength` until its asynchronous write callback, so two synchronous writes in one tick are enough to cross a small limit deterministically. Cases:
  - Construction does nothing: `resolvePath` not called, no file exists.
  - The first `write` calls `resolvePath` once, opens, and makes `isOpen()` true and `openedPath()` the resolved path; later writes do not call `resolvePath` again; after `dispose()` and the stream's `'close'`, the file holds exactly the lines written, in order.
  - A write whose bytes would push past the limit abandons: `onFailure` fires once, `isOpen()` turns false, later writes are no-ops (file content stops at the last accepted line), `openedPath()` still names the file, and `dispose()` after it does not throw.
  - The limit counts UTF-8 bytes: a line of multi-byte characters whose character count fits but whose byte count does not is refused.
  - A first line that alone exceeds the limit is refused, and `onFailure` fires once.
  - A `resolvePath` that throws (make it call `mkdirSync` beneath a path that is a regular file, so it throws `ENOTDIR`): `onFailure` fires once, `isOpen()` is false, `openedPath()` is `undefined`, and a further `write` does not call `resolvePath` again.
  - A stream `'error'` (a `resolvePath` returning an existing directory, so the open fails asynchronously with `EISDIR`): after awaiting the error, `onFailure` has fired exactly once and `isOpen()` is false.
  - `dispose()` before any write creates no file and a later `write` opens nothing; a second `dispose()` is harmless; `onFailure` never fires on a clean dispose.
- `src/harness/recorder.test.ts` stays green **unchanged**, as the extraction's regression guard. `src/harness/recorder-backpressure.test.ts` stays green with only its constant import changed (above) — in particular its `accepted` count of 4, `end` never called after abandon, and the header-over-budget case.

## Verification

- `./scripts/run.mjs check-diff` — lint, typecheck, and the server tests above green.
- No manual check: recorder behavior is unchanged and covered by its existing suites.

## Out of scope

- Any shell transcript code — the writer that uses this module is subplan 04.
- Changing recorder output format, timing, or failure notifications.
- The RPC rename (subplan 02) and the directory/notification plumbing (subplan 03).
