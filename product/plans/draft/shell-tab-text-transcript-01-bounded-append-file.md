# Shell tab text transcript 01: shared bounded append file

**Complexity: 3/10** — one new module extracted from an existing class plus its unit tests, with the recorder moved onto it under an unchanged regression suite; the only subtlety is preserving the recorder's header-then-`onOpened` ordering and fail-once semantics exactly.

## Goal

Extract the lazy-open, single-stream, pending-byte-limited, fail-once append logic out of `HarnessRecorder` into one shared `BoundedAppendFile` module, so the 4 MiB pending-write rule has a single implementation that both the recorder and the later shell transcript writer (subplan 04) use. Behavior of the recorder is unchanged.

Source plan: `product/plans/ready/shell-tab-text-transcript.md`, implementation-order step 1.

## Design decisions carried from the source plan

- **Decision 18** — the bounded append file is extracted from `HarnessRecorder` and shared, so the 4 MiB rule has one implementation.
- **Decision 7** (the memory half) — the pending-write limit stays 4 MiB; accepting a write that would exceed it abandons the file and fires the failure callback once. The "transcript stops for the rest of the session" consequence is realised when subplan 04 uses this module.

## Dependencies

None. Independent of subplans 02 and 03.

## Existing code to reuse

| Piece | Where | Use |
| --- | --- | --- |
| `HarnessRecorder` stream handling: `open()`, `abandon()`, `writeLine()`, `dispose()`, the `stream.on('error')` handler, the synchronous-throw guard around open | `src/harness/recorder.ts` | The behavior being extracted, verbatim in semantics |
| `MAX_PENDING_RECORDING_BYTES` (`4 * 1024 * 1024`) | `src/harness/recorder.ts:8` | Moves into the new module under a rule-describing name |
| `ensureRecordingDirectory`, `harnessRecordingPath` | `src/harness/recording-file.ts` | Supplied to the new module by the recorder as its directory/path factory |
| Sibling top-level utility module placement | `src/atomic-write.ts` | The new file sits beside it |
| Real-temp-dir recorder tests and the stalled-stream backpressure test | `src/harness/recorder.test.ts`, `src/harness/recorder-backpressure.test.ts` | Regression guard; must stay green unchanged |

## Proposed changes

- New `src/bounded-append-file.ts`, beside `src/atomic-write.ts`, exporting `BoundedAppendFile`. It is constructed with a path factory (which also ensures the directory — or a separate ensure step the factory caller supplies; choose whichever keeps the recorder's existing "ensure, then compute path, then open" order), a pending-byte limit, and a required failure callback. On its first write it ensures the directory, opens one append stream, attaches an `'error'` handler that abandons, and reports the opened path once (via a return value or an `onOpened`-style hook — the recorder must still be able to write its asciicast header *before* its own `onOpened` fires, so the module must let the caller write a first line before the opened path is announced to the outside world). A write that would push `writableLength` plus the line's byte length past the limit abandons; a synchronous open throw abandons; a stream `'error'` abandons. Abandoning destroys the stream and fires the failure callback at most once. `dispose()` ends the stream and is idempotent. Writes after abandon or dispose are no-ops. The module exposes the opened path (for `HarnessRecorder.recordingPath()`) and whether it has failed.
- Directory creation stays with the caller-supplied factory rather than a `mkdirSync` inside `BoundedAppendFile`. This is load-bearing: `src/harness/recorder-backpressure.test.ts` mocks `node:fs` as `{ createWriteStream }` only and mocks `./recording-file.js`'s `ensureRecordingDirectory`, so a `mkdirSync` imported by the new module would be undefined under that mock and the test would abandon on open. The new module imports only `createWriteStream` from `node:fs`; the recorder passes a factory that calls `ensureRecordingDirectory()` then returns `harnessRecordingPath(label, startedAt)`.
- The constant moves with the module and is renamed to describe the rule rather than recordings (for example `MAX_PENDING_APPEND_BYTES`). Its one importer today is `src/harness/recorder-backpressure.test.ts` (`import { HarnessRecorder, MAX_PENDING_RECORDING_BYTES } from './recorder.js'`); updating that import to the new name and module is the only permitted change to that test.
- `src/harness/recorder.ts` replaces its own `stream`/`path`/`failed` handling with a `BoundedAppendFile`. It keeps its own `subscription`, `clock`, `colors`, `startedAt` and `disposed` state, its `pty` bus wiring, its unsubscribe-on-abandon (the bus subscription is the recorder's, so the recorder's failure callback wrapper unsubscribes before calling the caller's `onFailure`), its header-then-`onOpened` ordering, and its "resize before first output only updates header dimensions" rule. Its comments are updated to point at the shared module for the stream rules rather than restating them.
- Both files stay under the 200-line limit; the recorder should shrink.

## Tests

- New `src/bounded-append-file.test.ts` (real temp directory, plus a stalled writable stream where needed, in the style of `src/harness/recorder-backpressure.test.ts`): no file before the first write (lazy open); the opened path is reported exactly once; a write that would exceed the pending-byte limit abandons, writes nothing further, and fires the failure callback once; a stream `'error'` does the same; an unwritable directory (synchronous open failure) does the same; `dispose()` closes the stream and a second `dispose()` is harmless; writes after dispose or abandon are ignored.
- `src/harness/recorder.test.ts` stays green **unchanged**, as the extraction's regression guard. `src/harness/recorder-backpressure.test.ts` stays green (constant import path aside).

## Verification

- `./scripts/run.mjs check-diff` — lint, typecheck, and the server tests above green.
- No manual check: recorder behavior is unchanged and covered by its existing suites.

## Out of scope

- Any shell transcript code — the writer that uses this module is subplan 04.
- Changing recorder output format, timing, or failure notifications.
- The RPC rename (subplan 02) and the directory/notification plumbing (subplan 03).
